/**
 * DAM Gesichtserkennung — Scan/Backfill von der Kommandozeile.
 * Läuft auch bei FACE_RECOGNITION_ENABLED=false (nur REKOGNITION_* nötig),
 * damit ein Testlauf vor dem Einschalten möglich ist.
 *
 *   npm run dam:face-scan -- --stats
 *   npm run dam:face-scan -- --limit 200
 *   npm run dam:face-scan                    (ganze Warteschlange)
 *   npm run dam:face-scan -- --retry-failed  (failed → pending, dann scannen)
 */

import { config } from "dotenv";

config({ path: ".env" });
config({ path: ".env.local", override: true });

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const { prisma } = await import("../src/lib/db");
  const { rekognitionConfigured } = await import("../src/lib/dam/face-rekognition");
  const { runDamFaceScan } = await import("../src/lib/dam/face-scheduler");

  const printStats = async () => {
    const byStatus = await prisma.asset.groupBy({
      by: ["faceStatus"],
      where: { status: { in: ["staging", "published"] }, deletedAt: null },
      _count: true,
    });
    const byMatch = await prisma.assetFace.groupBy({ by: ["status"], _count: true });
    const persons = await prisma.damPerson.count();
    console.log("Bilder:", Object.fromEntries(byStatus.map((row) => [row.faceStatus, row._count])));
    console.log("Gesichter:", Object.fromEntries(byMatch.map((row) => [row.status, row._count])));
    console.log("Personen:", persons);
  };

  try {
    if (process.argv.includes("--stats")) {
      await printStats();
      return;
    }
    if (!rekognitionConfigured()) {
      throw new Error("REKOGNITION_* fehlt in .env");
    }
    if (process.argv.includes("--retry-failed")) {
      const reset = await prisma.$executeRaw`
        UPDATE "asset" SET "faceStatus" = 'pending'::"FaceScanStatus"
        WHERE "faceStatus" = 'failed'::"FaceScanStatus"
      `;
      console.log(`[dam-face] ${reset} fehlgeschlagene Bilder zurück in die Warteschlange`);
    }

    const rawLimit = argValue("--limit");
    const limit = rawLimit ? Number(rawLimit) : Infinity;
    if (rawLimit && (!Number.isInteger(limit) || limit <= 0)) {
      throw new Error("--limit braucht eine positive Zahl");
    }

    const started = Date.now();
    const summary = await runDamFaceScan(limit);
    console.log(
      `[dam-face] fertig in ${Math.round((Date.now() - started) / 1000)}s: done=${summary.done} skipped=${summary.skipped} failed=${summary.failed} faces=${summary.faces}`,
    );
    await printStats();
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("[dam-face]", error instanceof Error ? error.message : error);
  process.exit(1);
});
