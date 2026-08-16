/**
 * Production migrate entrypoint.
 * One-shot recovery: if member_usage is stuck failed (partial apply),
 * mark it rolled-back so idempotent SQL can re-apply, then migrate deploy.
 */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { Client } from "pg";

const FAILED_MIGRATION = "20260816100000_member_usage";

function debugLog(
  hypothesisId: string,
  location: string,
  message: string,
  data: Record<string, unknown>,
) {
  // #region agent log
  const payload = {
    sessionId: "9b87ec",
    runId: process.env.DEBUG_RUN_ID ?? "migrate-deploy",
    hypothesisId,
    location,
    message,
    data,
    timestamp: Date.now(),
  };
  console.log(`[migrate-deploy][${hypothesisId}] ${message}`, JSON.stringify(data));
  fetch("http://127.0.0.1:7763/ingest/1fb8c4af-59a8-417d-8bad-c18c3a190274", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "9b87ec",
    },
    body: JSON.stringify(payload),
  }).catch(() => {});
  // #endregion
}

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
    const failed = await client.query<{ migration_name: string; logs: string | null }>(
      `SELECT migration_name, logs
       FROM "_prisma_migrations"
       WHERE migration_name = $1
         AND finished_at IS NULL
         AND rolled_back_at IS NULL
       LIMIT 1`,
      [FAILED_MIGRATION],
    );

    if (failed.rows.length === 0) {
      debugLog("A", "migrate-deploy.ts:check", "no failed member_usage migration", {});
      return;
    }

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
    debugLog("B", "migrate-deploy.ts:partial", "failed member_usage state", {
      typeExists,
      tableExists,
      logsPreview: (failed.rows[0]?.logs ?? "").slice(0, 300),
    });

    // Partial or full schema already present → mark applied so deploy is unblocked.
    // Empty schema → mark rolled-back so idempotent migration can re-run.
    if (typeExists || tableExists) {
      debugLog("C", "migrate-deploy.ts:resolve", "marking member_usage as applied", {
        typeExists,
        tableExists,
      });
      // Ensure remaining objects exist before marking applied
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
      debugLog("C", "migrate-deploy.ts:resolve", "marking member_usage as rolled-back", {});
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
  debugLog("D", "migrate-deploy.ts:done", "migrate deploy completed", {});
}

main().catch((err) => {
  console.error("[migrate-deploy] failed", err);
  process.exit(1);
});
