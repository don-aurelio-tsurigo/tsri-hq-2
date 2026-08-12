/**
 * Production-safe migrate deploy.
 * Recovers when `db:push` applied schema ahead of migration history
 * (column already exists → failed migration → P3009 on restart).
 */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { Client } from "pg";

const SESSION_ID = "5f3349";
const LOG_PATH =
  "/Users/eliodonauer/Documents/Cursor/neues-verwaltungstool/neuesverwaltungstool/.cursor/debug-5f3349.log";
const INGEST =
  "http://127.0.0.1:7763/ingest/1fb8c4af-59a8-417d-8bad-c18c3a190274";

type Hypo = "A" | "B" | "C" | "D" | "E";

function debugLog(
  hypothesisId: Hypo,
  location: string,
  message: string,
  data: Record<string, unknown>,
) {
  const payload = {
    sessionId: SESSION_ID,
    runId: process.env.DEBUG_RUN_ID ?? "migrate-deploy",
    hypothesisId,
    location,
    message,
    data,
    timestamp: Date.now(),
  };
  // #region agent log
  try {
    appendFileSync(LOG_PATH, `${JSON.stringify(payload)}\n`);
  } catch {
    /* local path may be missing on Render */
  }
  fetch(INGEST, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": SESSION_ID,
    },
    body: JSON.stringify(payload),
  }).catch(() => {});
  // #endregion
  console.log(`[migrate-deploy][${hypothesisId}] ${message}`, JSON.stringify(data));
}

const MIGRATION_COLUMNS: Record<string, string[]> = {
  "20260811140000_carousel_source_article": [
    "sourceUrl",
    "sourceTitle",
    "sourceLead",
    "sourceBody",
  ],
  "20260811160000_carousel_source_pre_title": ["sourcePreTitle"],
};

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    const cols = await client.query<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'carousel_post'
       ORDER BY 1`,
    );
    const columnNames = cols.rows.map((r) => r.column_name);
    // #region agent log
    debugLog("A", "migrate-deploy.ts:columns", "carousel_post columns", {
      columnNames,
    });
    // #endregion

    const failed = await client.query<{
      migration_name: string;
      started_at: Date;
      finished_at: Date | null;
      rolled_back_at: Date | null;
    }>(
      `SELECT migration_name, started_at, finished_at, rolled_back_at
       FROM "_prisma_migrations"
       WHERE finished_at IS NULL AND rolled_back_at IS NULL
       ORDER BY started_at`,
    );
    // #region agent log
    debugLog("B", "migrate-deploy.ts:failed", "unfinished migrations", {
      failed: failed.rows.map((r) => r.migration_name),
    });
    // #endregion

    for (const row of failed.rows) {
      const needed = MIGRATION_COLUMNS[row.migration_name];
      if (!needed) {
        // #region agent log
        debugLog("D", "migrate-deploy.ts:unknown-failed", "failed migration without heal map", {
          migration: row.migration_name,
        });
        // #endregion
        continue;
      }
      const allPresent = needed.every((c) => columnNames.includes(c));
      // #region agent log
      debugLog("C", "migrate-deploy.ts:heal-check", "column presence for failed migration", {
        migration: row.migration_name,
        needed,
        allPresent,
      });
      // #endregion
      if (allPresent) {
        // #region agent log
        debugLog("E", "migrate-deploy.ts:resolve", "marking failed migration as applied", {
          migration: row.migration_name,
        });
        // #endregion
        execFileSync(
          "npx",
          ["prisma", "migrate", "resolve", "--applied", row.migration_name],
          { stdio: "inherit", env: process.env },
        );
      }
    }
  } finally {
    await client.end();
  }

  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    stdio: "inherit",
    env: process.env,
  });
  // #region agent log
  debugLog("E", "migrate-deploy.ts:done", "migrate deploy completed", {});
  // #endregion
}

main().catch((err) => {
  console.error("[migrate-deploy] failed", err);
  process.exit(1);
});
