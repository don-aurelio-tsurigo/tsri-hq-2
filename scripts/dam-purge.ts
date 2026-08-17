/**
 * Manual DAM trash / rejected purge (same logic as the in-process daily job).
 *
 *   npm run dam:purge
 */

import { config } from "dotenv";
import { purgeExpiredDamAssets } from "../src/lib/dam/trash";

config({ path: ".env" });
config({ path: ".env.local", override: true });

async function main() {
  const summary = await purgeExpiredDamAssets();
  console.log(JSON.stringify(summary, null, 2));
  if (summary.errors > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
