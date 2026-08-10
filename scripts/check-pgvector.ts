/**
 * Preflight: is pgvector available / creatable on DATABASE_URL?
 *
 * Usage:
 *   npx tsx scripts/check-pgvector.ts
 *
 * Run this against Render (or staging) BEFORE `prisma migrate deploy`
 * of add_rag_pgvector_schema. Does not leave the extension installed
 * if it was missing — only reports availability.
 */

import "dotenv/config";
import pg from "pg";

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error("DATABASE_URL fehlt.");
  }

  const host = new URL(url.replace(/^postgres(ql)?:/, "http:")).hostname;
  console.log(`Host: ${host}`);

  const pool = new pg.Pool({ connectionString: url });
  const client = await pool.connect();
  try {
    const available = await client.query<{ name: string; default_version: string }>(
      `SELECT name, default_version
       FROM pg_available_extensions
       WHERE name = 'vector'`
    );

    if (available.rows.length === 0) {
      console.error(
        "FAIL: Extension \"vector\" (pgvector) ist auf dieser Instanz nicht verfügbar.\n" +
          "Render: ggf. Plan/Engine ohne pgvector — Migration würde an CREATE EXTENSION scheitern.\n" +
          "Optionen: Render Postgres mit pgvector, eigener PG-Host, oder pgvector manuell vom Support aktivieren lassen."
      );
      process.exitCode = 1;
      return;
    }

    console.log(
      `OK: pgvector verfügbar (default_version=${available.rows[0]!.default_version})`
    );

    const installed = await client.query<{ extversion: string }>(
      `SELECT extversion FROM pg_extension WHERE extname = 'vector'`
    );
    if (installed.rows.length > 0) {
      console.log(`OK: bereits installiert (extversion=${installed.rows[0]!.extversion})`);
    } else {
      console.log("Info: noch nicht installiert — Migration führt CREATE EXTENSION aus.");
    }

    // Permission probe without committing install permanently if it fails mid-way:
    // try CREATE in a transaction and roll back.
    await client.query("BEGIN");
    try {
      await client.query("CREATE EXTENSION IF NOT EXISTS vector");
      await client.query("ROLLBACK");
      console.log("OK: CREATE EXTENSION ist mit der aktuellen Rolle erlaubt (Probe gerollt zurück).");
    } catch (err) {
      await client.query("ROLLBACK");
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        "FAIL: CREATE EXTENSION nicht erlaubt:\n" +
          `  ${msg}\n` +
          "Auf Render braucht die DB-Rolle oft Superuser/erweiterte Rechte — Support fragen oder Extension vorab manuell aktivieren."
      );
      process.exitCode = 1;
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
