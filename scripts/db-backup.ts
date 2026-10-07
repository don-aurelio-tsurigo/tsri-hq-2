/**
 * Postgres-Backup (pg_dump, custom format) in einen separaten R2-Backup-Bucket.
 *
 *   npm run db:backup                  # → daily/<timestamp>.dump (+ monthly/ am 1. des Monats)
 *   npm run db:backup -- --prefix manual
 *
 * Aufbewahrung regeln die Lifecycle-Regeln des Buckets, nicht dieses Script.
 * Siehe docs/backup.md.
 */

import { config } from "dotenv";
import { execFileSync } from "node:child_process";
import { createReadStream, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

config({ path: ".env" });
config({ path: ".env.local", override: true });

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} fehlt.`);
  return value;
}

function parsePrefix(): string {
  const i = process.argv.indexOf("--prefix");
  const prefix = i >= 0 ? process.argv[i + 1] : "daily";
  if (!prefix || !/^[a-z0-9-]+$/.test(prefix)) {
    throw new Error(`Ungültiger --prefix: ${prefix}`);
  }
  return prefix;
}

function explainR2Error(error: unknown): never {
  const code = (error as { Code?: string; name?: string }).Code ?? (error as Error).name;
  if (code === "AccessDenied") {
    throw new Error(
      "R2 hat den Upload abgelehnt (AccessDenied). Prüfen: Token hat «Object Read & Write» " +
        "auf genau diesen Bucket, BACKUP_R2_BUCKET_NAME ist exakt der Bucket-Name, " +
        "BACKUP_R2_ACCOUNT_ID gehört zum Token, und bei EU-Buckets ist BACKUP_R2_ENDPOINT gesetzt.",
      { cause: error },
    );
  }
  throw error;
}

async function main() {
  const databaseUrl = process.env.BACKUP_DATABASE_URL?.trim() || required("DATABASE_URL");
  const accountId = required("BACKUP_R2_ACCOUNT_ID");
  const bucket = required("BACKUP_R2_BUCKET_NAME");
  // EU-Jurisdiction-Buckets brauchen https://<account>.eu.r2.cloudflarestorage.com
  const endpoint =
    process.env.BACKUP_R2_ENDPOINT?.trim() || `https://${accountId}.r2.cloudflarestorage.com`;
  const client = new S3Client({
    region: "auto",
    endpoint,
    credentials: {
      accessKeyId: required("BACKUP_R2_ACCESS_KEY_ID"),
      secretAccessKey: required("BACKUP_R2_SECRET_ACCESS_KEY"),
    },
  });

  const send = (command: PutObjectCommand) => client.send(command).catch(explainR2Error);

  const prefix = parsePrefix();
  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  const dir = mkdtempSync(join(tmpdir(), "db-backup-"));
  const file = join(dir, "backup.dump");

  try {
    console.log(`[db-backup] pg_dump → ${file}`);
    execFileSync(
      "pg_dump",
      ["--format=custom", "--compress=9", "--no-owner", "--no-acl", "--file", file, databaseUrl],
      { stdio: "inherit" },
    );
    const size = statSync(file).size;
    if (size === 0) throw new Error("pg_dump hat eine leere Datei erzeugt.");

    const keys = [`${prefix}/${stamp}.dump`];
    if (prefix === "daily" && now.getUTCDate() === 1) keys.push(`monthly/${stamp}.dump`);

    for (const key of keys) {
      await send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: createReadStream(file),
          ContentLength: size,
          ContentType: "application/octet-stream",
        }),
      );
      console.log(`[db-backup] hochgeladen: ${bucket}/${key} (${(size / 1024 / 1024).toFixed(1)} MB)`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error("[db-backup] fehlgeschlagen", err);
  process.exit(1);
});
