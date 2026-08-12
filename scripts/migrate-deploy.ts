/**
 * Production-safe migrate deploy.
 * Recovers when `db:push` applied schema ahead of migration history
 * (object already exists → failed migration → P3009 on restart).
 */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { Client } from "pg";

const SESSION_ID = "b0fde8";
const LOG_PATH =
  "/Users/eliodonauer/Documents/Cursor/neues-verwaltungstool/neuesverwaltungstool/.cursor/debug-b0fde8.log";
const INGEST =
  "http://127.0.0.1:7763/ingest/1fb8c4af-59a8-417d-8bad-c18c3a190274";

type Hypo = "A" | "B" | "C" | "D" | "E";

type HealSpec = {
  /** Columns that must exist on a table (carousel-style ALTER migrations). */
  columns?: { table: string; names: string[] };
  /** Tables that must exist (CREATE TABLE migrations). */
  tables?: string[];
  /** Enum type names that must exist (CREATE TYPE migrations). */
  enums?: string[];
};

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

const MIGRATION_HEAL: Record<string, HealSpec> = {
  "20260811140000_carousel_source_article": {
    columns: {
      table: "carousel_post",
      names: ["sourceUrl", "sourceTitle", "sourceLead", "sourceBody"],
    },
  },
  "20260811160000_carousel_source_pre_title": {
    columns: { table: "carousel_post", names: ["sourcePreTitle"] },
  },
  "20260812140000_add_ads": {
    tables: ["campaign", "creative", "ad_event"],
    enums: ["CampaignStatus", "CreativeType", "AdEventType"],
  },
  "20260812170000_campaign_impression_limit": {
    columns: { table: "campaign", names: ["impressionLimit"] },
  },
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

    const adsTables = await client.query<{ table_name: string }>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name IN ('campaign', 'creative', 'ad_event')
       ORDER BY 1`,
    );
    const adsEnums = await client.query<{ typname: string }>(
      `SELECT t.typname
       FROM pg_type t
       JOIN pg_namespace n ON n.oid = t.typnamespace
       WHERE n.nspname = 'public'
         AND t.typname IN ('CampaignStatus', 'CreativeType', 'AdEventType')
       ORDER BY 1`,
    );
    const presentTables = new Set(adsTables.rows.map((r) => r.table_name));
    const presentEnums = new Set(adsEnums.rows.map((r) => r.typname));
    // #region agent log
    debugLog("A", "migrate-deploy.ts:ads-schema", "ads tables/enums present", {
      tables: [...presentTables],
      enums: [...presentEnums],
    });
    // #endregion

    const impressionLimitCols = await client.query<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'campaign'
         AND column_name = 'impressionLimit'`,
    );
    const hasImpressionLimit = impressionLimitCols.rows.length > 0;
    // #region agent log
    debugLog("A", "migrate-deploy.ts:impressionLimit", "campaign.impressionLimit present?", {
      hasImpressionLimit,
      healMapHasImpressionMigration: Object.prototype.hasOwnProperty.call(
        MIGRATION_HEAL,
        "20260812170000_campaign_impression_limit",
      ),
    });
    // #endregion

    const failed = await client.query<{
      migration_name: string;
      started_at: Date;
      finished_at: Date | null;
      rolled_back_at: Date | null;
      logs: string | null;
    }>(
      `SELECT migration_name, started_at, finished_at, rolled_back_at, logs
       FROM "_prisma_migrations"
       WHERE finished_at IS NULL AND rolled_back_at IS NULL
       ORDER BY started_at`,
    );
    // #region agent log
    debugLog("B", "migrate-deploy.ts:failed", "unfinished migrations", {
      failed: failed.rows.map((r) => ({
        migration: r.migration_name,
        started_at: r.started_at,
        logsPreview: (r.logs ?? "").slice(0, 500),
      })),
    });
    // #endregion

    for (const row of failed.rows) {
      const spec = MIGRATION_HEAL[row.migration_name];
      if (!spec) {
        // #region agent log
        debugLog("D", "migrate-deploy.ts:unknown-failed", "failed migration without heal map", {
          migration: row.migration_name,
          hasImpressionLimit,
          logsPreview: (row.logs ?? "").slice(0, 500),
        });
        // #endregion
        continue;
      }

      let allPresent = true;
      if (spec.columns) {
        const tableCols = await client.query<{ column_name: string }>(
          `SELECT column_name
           FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = $1`,
          [spec.columns.table],
        );
        const names = new Set(tableCols.rows.map((r) => r.column_name));
        allPresent = spec.columns.names.every((c) => names.has(c));
      }
      if (spec.tables) {
        allPresent = allPresent && spec.tables.every((t) => presentTables.has(t));
      }
      if (spec.enums) {
        allPresent = allPresent && spec.enums.every((e) => presentEnums.has(e));
      }

      // #region agent log
      debugLog("C", "migrate-deploy.ts:heal-check", "schema presence for failed migration", {
        migration: row.migration_name,
        spec,
        allPresent,
        presentTables: [...presentTables],
        presentEnums: [...presentEnums],
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
      } else {
        // Schema missing → allow migrate deploy to retry the SQL.
        // #region agent log
        debugLog("E", "migrate-deploy.ts:resolve", "marking failed migration as rolled-back for retry", {
          migration: row.migration_name,
        });
        // #endregion
        execFileSync(
          "npx",
          ["prisma", "migrate", "resolve", "--rolled-back", row.migration_name],
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
