/**
 * Local-only schema push helper.
 * On Render/production this is a no-op so a leftover Build Command
 * (`npm run db:push`) cannot drop tables like rag.sync_state.
 */
const { spawnSync } = require("node:child_process");

const onRender = Boolean(process.env.RENDER || process.env.RENDER_SERVICE_ID);
const isProd = process.env.NODE_ENV === "production";

if (onRender || isProd) {
  // #region agent log
  fetch("http://127.0.0.1:7763/ingest/1fb8c4af-59a8-417d-8bad-c18c3a190274", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "9b87ec",
    },
    body: JSON.stringify({
      sessionId: "9b87ec",
      hypothesisId: "A",
      location: "scripts/db-push.js:skip",
      message: "db:push skipped on Render/production",
      data: { onRender, isProd },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
  console.log(
    "[db:push] skipped on Render/production — schema is applied via migrate deploy on start. Remove db:push from the Render Build Command.",
  );
  process.exit(0);
}

const result = spawnSync(
  "npx",
  ["prisma", "db", "push", ...process.argv.slice(2)],
  { stdio: "inherit", env: process.env },
);
process.exit(result.status ?? 1);
