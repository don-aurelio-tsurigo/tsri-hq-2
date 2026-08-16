/**
 * Production migrate entrypoint.
 * One-shot recovery for a stuck failed member_usage migration (partial apply / P3009),
 * then runs prisma migrate deploy.
 */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { Client } from "pg";

const FAILED_MIGRATION = "20260816100000_member_usage";

function prismaResolve(flag: "--rolled-back" | "--applied", name: string) {
  execFileSync("npx", ["prisma", "migrate", "resolve", flag, name], {
    stdio: "inherit",
    env: process.env,
  });
}

async function recoverFailedMemberUsageIfNeeded() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }

  const client = new Client({ connectionString });
  await client.connect();
  try {
    const failed = await client.query<{ migration_name: string }>(
      `SELECT migration_name
       FROM "_prisma_migrations"
       WHERE migration_name = $1
         AND finished_at IS NULL
         AND rolled_back_at IS NULL
       LIMIT 1`,
      [FAILED_MIGRATION],
    );

    if (failed.rows.length === 0) return;

    const typeRow = await client.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM pg_type t
         JOIN pg_namespace n ON n.oid = t.typnamespace
         WHERE n.nspname = 'public' AND t.typname = 'MemberUsageKind'
       ) AS exists`,
    );
    const tableRow = await client.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'member_usage'
       ) AS exists`,
    );

    const typeExists = Boolean(typeRow.rows[0]?.exists);
    const tableExists = Boolean(tableRow.rows[0]?.exists);

    if (typeExists || tableExists) {
      console.log(
        `[migrate-deploy] recovering ${FAILED_MIGRATION} as applied (type=${typeExists} table=${tableExists})`,
      );
      await client.query(`
        DO $$ BEGIN
          CREATE TYPE "MemberUsageKind" AS ENUM ('ai', 'rag_search', 'image_proxy');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS "member_usage" (
          "id" TEXT NOT NULL,
          "userId" TEXT NOT NULL,
          "kind" "MemberUsageKind" NOT NULL,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "member_usage_pkey" PRIMARY KEY ("id")
        );
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS "member_usage_userId_kind_createdAt_idx"
          ON "member_usage"("userId", "kind", "createdAt");
      `);
      await client.query(`
        DO $$ BEGIN
          ALTER TABLE "member_usage"
            ADD CONSTRAINT "member_usage_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "user"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
      `);
      prismaResolve("--applied", FAILED_MIGRATION);
    } else {
      console.log(
        `[migrate-deploy] recovering ${FAILED_MIGRATION} as rolled-back`,
      );
      prismaResolve("--rolled-back", FAILED_MIGRATION);
    }
  } finally {
    await client.end();
  }
}

async function main() {
  await recoverFailedMemberUsageIfNeeded();
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    stdio: "inherit",
    env: process.env,
  });
}

main().catch((err) => {
  console.error("[migrate-deploy] failed", err);
  process.exit(1);
});
