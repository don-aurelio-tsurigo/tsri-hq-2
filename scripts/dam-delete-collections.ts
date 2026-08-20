/**
 * Delete DAM collections by exact name. Asset files stay; only the
 * collection rows and their AssetCollection links are removed.
 *
 *   npx tsx scripts/dam-delete-collections.ts --dry-run
 *   npx tsx scripts/dam-delete-collections.ts
 */

import { config } from "dotenv";

config({ path: ".env" });
config({ path: ".env.local", override: true });

const DEFAULT_NAMES = [
  "Mediagraph-Archiv (unsortiert)",
  "C_transfer Mailchimp",
  "D_transfer Tsüri Editor",
];

function parseArgs(argv: string[]) {
  const dryRun = argv.includes("--dry-run");
  const names = argv.filter((arg) => !arg.startsWith("--"));
  return { dryRun, names: names.length > 0 ? names : DEFAULT_NAMES };
}

async function main() {
  const { prisma } = await import("../src/lib/db");
  const { dryRun, names } = parseArgs(process.argv.slice(2));
  try {
    const rows = await prisma.collection.findMany({
      where: { name: { in: names } },
      select: {
        id: true,
        name: true,
        mediagraphId: true,
        _count: { select: { assets: true } },
      },
      orderBy: { name: "asc" },
    });

    const found = new Set(rows.map((row) => row.name));
    const missing = names.filter((name) => !found.has(name));
    if (missing.length > 0) {
      console.warn(`[dam] not found: ${missing.join(" | ")}`);
    }
    if (rows.length === 0) {
      console.log("[dam] nothing to delete");
      return;
    }

    for (const row of rows) {
      console.log(
        `${dryRun ? "would delete" : "deleting"} ${row.name} id=${row.id} assets=${row._count.assets} mediagraphId=${row.mediagraphId ?? "—"}`,
      );
    }

    if (dryRun) return;

    const result = await prisma.collection.deleteMany({
      where: { id: { in: rows.map((row) => row.id) } },
    });
    console.log(`[dam] deleted ${result.count} collection(s)`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
