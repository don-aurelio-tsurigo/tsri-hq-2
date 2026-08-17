/**
 * Local-only schema push helper.
 * On Render/production this is a no-op so a leftover Build Command
 * (`npm run db:push`) cannot drop tables like rag.sync_state.
 */
const { spawnSync } = require("node:child_process");

const onRender = Boolean(process.env.RENDER || process.env.RENDER_SERVICE_ID);
const isProd = process.env.NODE_ENV === "production";

if (onRender || isProd) {
  console.log(
    "[db:push] skipped on Render/production — schema is applied via migrate deploy on start.",
  );
  process.exit(0);
}

const result = spawnSync(
  "npx",
  ["prisma", "db", "push", ...process.argv.slice(2)],
  { stdio: "inherit", env: process.env },
);
process.exit(result.status ?? 1);
