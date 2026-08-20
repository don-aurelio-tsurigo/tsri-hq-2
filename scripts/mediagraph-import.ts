/**
 * Mediagraph → DAM import (Phase 9 + 9b).
 *
 * Env:
 *   MEDIAGRAPH_TOKEN
 *   MEDIAGRAPH_ORG_ID
 *   MEDIAGRAPH_UPLOADER_USER_ID   (Elios User-ID in HQ)
 *   MEDIAGRAPH_UPLOADER_EMAIL     (optional fallback lookup)
 *   MEDIAGRAPH_RIGHTS_OWN_IDS / _PROVIDED_IDS / _FREE_USE_IDS  (optional, comma-separated)
 *   MEDIAGRAPH_REPORT_DIR         (default: ./tmp/mediagraph-import)
 *   MEDIAGRAPH_CONCURRENCY        (default: 3)
 *   DATABASE_URL, R2_*
 *
 * Usage:
 *   npm run dam:mediagraph-import -- --test
 *   npm run dam:mediagraph-import -- --test --dry-run
 *   npm run dam:mediagraph-import
 *   npm run dam:mediagraph-import -- --collections
 *   npm run dam:mediagraph-import -- --enrich --test
 */

import { config } from "dotenv";
import { prisma } from "../src/lib/db";
import {
  parseImportArgs,
  runMediagraphAssetImport,
  runMediagraphCollectionImport,
  runMediagraphEnrichment,
} from "../src/lib/dam/mediagraph-import";

config({ path: ".env" });
config({ path: ".env.local", override: true });

function printHelp(): void {
  console.log(`Mediagraph → DAM Import

  --test           erste Seite, per_page=5
  --dry-run        nur Mapping, kein R2/DB-Write
  --collections    Phase 9b: Collections + Asset-Zuordnung
  --enrich         Phase 9c+9d: Auto-Tags → Keywords, Description → Notes
  --concurrency=N  parallele Assets (default 3)

Reports: migration-errors.json, migration-videos-skipped.json, migration-rights-review.json
`);
}

async function main() {
  const argv = process.argv.slice(2);
  process.stderr.write(`[mediagraph] start ${argv.join(" ") || "(assets)"}\n`);
  if (argv.includes("--help") || argv.includes("-h")) {
    printHelp();
    return;
  }
  const opts = parseImportArgs(argv);
  if (opts.enrichOnly) {
    process.stderr.write("[mediagraph] mode=enrich\n");
    await runMediagraphEnrichment(opts);
    return;
  }
  if (opts.collectionsOnly) {
    process.stderr.write("[mediagraph] mode=collections\n");
    await runMediagraphCollectionImport(opts);
    return;
  }
  process.stderr.write("[mediagraph] mode=assets\n");
  await runMediagraphAssetImport(opts);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });
