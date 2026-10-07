/**
 * Restore-Probe: neuesten Dump aus dem R2-Backup-Bucket in eine leere Datenbank
 * (RESTORE_DATABASE_URL) einspielen und prüfen. Läuft in GitHub Actions gegen einen
 * Wegwerf-Postgres-Container, nie gegen die Produktion.
 *
 *   RESTORE_DATABASE_URL=… npx tsx scripts/db-restore-check.ts
 *
 * Schlägt fehl, wenn der neueste Dump älter als 48 h ist, der Restore scheitert,
 * Tabellen leer sind oder Migrationen fehlen. Siehe docs/backup.md.
 */

import { config } from "dotenv";
import { execFileSync } from "node:child_process";
import { createWriteStream, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { GetObjectCommand, ListObjectsV2Command, S3Client, type _Object } from "@aws-sdk/client-s3";
import { backupR2, required } from "./lib/backup-r2";
import { Client } from "pg";

config({ path: ".env" });
config({ path: ".env.local", override: true });

const MAX_AGE_HOURS = 48;
// Tabellen, die in einer echten Produktions-DB nie leer sein dürfen.
const MUST_HAVE_ROWS = ["public.user", "public._prisma_migrations"];

async function listAll(client: S3Client, bucket: string): Promise<_Object[]> {
  const objects: _Object[] = [];
  let token: string | undefined;
  do {
    const page = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }),
    );
    objects.push(...(page.Contents ?? []));
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return objects;
}

async function main() {
  const restoreUrl = required("RESTORE_DATABASE_URL");
  const { client, bucket } = backupR2();

  const problems: string[] = [];

  const dumps = (await listAll(client, bucket))
    .filter((o) => o.Key?.endsWith(".dump") && o.LastModified)
    .sort((a, b) => b.LastModified!.getTime() - a.LastModified!.getTime());
  const latest = dumps[0];
  if (!latest) throw new Error("Keine .dump-Datei im Backup-Bucket gefunden.");

  const ageHours = (Date.now() - latest.LastModified!.getTime()) / 36e5;
  console.log(
    `[restore-check] ${dumps.length} Dumps im Bucket, neuester: ${latest.Key} ` +
      `(${((latest.Size ?? 0) / 1024 / 1024).toFixed(1)} MB, vor ${ageHours.toFixed(1)} h)`,
  );
  if (ageHours > MAX_AGE_HOURS) {
    problems.push(`Neuester Dump ist ${ageHours.toFixed(0)} h alt – läuft das nächtliche Backup?`);
  }

  const dir = mkdtempSync(join(tmpdir(), "db-restore-"));
  const file = join(dir, "backup.dump");
  const db = new Client({ connectionString: restoreUrl });

  try {
    const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: latest.Key }));
    await pipeline(object.Body as Readable, createWriteStream(file));

    await db.connect();
    // pg_dump --no-owner legt Extensions mit an; vector vorab, falls die Rechte fehlen.
    await db.query("CREATE EXTENSION IF NOT EXISTS vector");

    const started = Date.now();
    execFileSync(
      "pg_restore",
      ["--no-owner", "--no-acl", "--exit-on-error", "--dbname", restoreUrl, file],
      { stdio: "inherit" },
    );
    console.log(`[restore-check] pg_restore ok (${((Date.now() - started) / 1000).toFixed(0)} s)`);

    const tables = await db.query<{ schema: string; name: string }>(
      `SELECT table_schema AS schema, table_name AS name
       FROM information_schema.tables
       WHERE table_type = 'BASE TABLE' AND table_schema IN ('public', 'rag')
       ORDER BY 1, 2`,
    );
    if (tables.rows.length === 0) problems.push("Keine Tabellen nach dem Restore.");

    let totalRows = 0;
    const counts = new Map<string, number>();
    for (const { schema, name } of tables.rows) {
      const res = await db.query<{ n: string }>(
        `SELECT count(*)::bigint AS n FROM "${schema}"."${name}"`,
      );
      const n = Number(res.rows[0].n);
      counts.set(`${schema}.${name}`, n);
      totalRows += n;
    }
    console.log(`[restore-check] ${tables.rows.length} Tabellen, ${totalRows} Zeilen total`);
    // Zeilenzahlen pro Tabelle nur lokal: Das Repo ist öffentlich, die Action-Logs auch.
    const empty = [...counts].filter(([, n]) => n === 0).map(([t]) => t);
    if (empty.length > 0) console.log(`  leere Tabellen: ${empty.join(", ")}`);
    if (!process.env.CI) {
      for (const [table, n] of counts) console.log(`  ${table.padEnd(48)} ${n}`);
    }

    for (const table of MUST_HAVE_ROWS) {
      if (!counts.get(table)) problems.push(`Tabelle ${table} fehlt oder ist leer.`);
    }

    // Migrationen im Dump vs. im Repo. Neuere Migrationen im Repo als im Dump sind ok
    // (Dump ist älter als der letzte Deploy), fehlende alte nicht.
    const applied = new Set(
      (
        await db.query<{ migration_name: string }>(
          `SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`,
        )
      ).rows.map((r) => r.migration_name),
    );
    const inRepo = readdirSync("prisma/migrations", { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
    const missing = inRepo.filter((m) => !applied.has(m));
    const newest = [...applied].sort().at(-1);
    const missingOld = missing.filter((m) => newest && m < newest);
    console.log(
      `[restore-check] Migrationen: ${applied.size} im Dump, ${inRepo.length} im Repo, neueste im Dump: ${newest}`,
    );
    if (missing.length > missingOld.length) {
      console.log(`  noch nicht im Dump (neuer): ${missing.filter((m) => !missingOld.includes(m)).join(", ")}`);
    }
    if (missingOld.length > 0) {
      problems.push(`Migrationen fehlen im Dump: ${missingOld.join(", ")}`);
    }
  } finally {
    await db.end().catch(() => {});
    rmSync(dir, { recursive: true, force: true });
  }

  if (problems.length > 0) {
    for (const p of problems) console.error(`[restore-check] ✗ ${p}`);
    process.exit(1);
  }
  console.log("[restore-check] ✓ Restore-Probe bestanden");
}

main().catch((err) => {
  console.error("[restore-check] fehlgeschlagen", err);
  process.exit(1);
});
