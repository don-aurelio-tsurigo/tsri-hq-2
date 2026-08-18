import { prisma } from "@/lib/db";
import { parseEditParams } from "@/lib/dam/edit-params";
import { latestWepublishExportedAt, wepublishExportLogSelect } from "@/lib/dam/export-wepublish";
import type { PersonalAssetCard } from "@/lib/dam/types";

export async function listRecentCredits(userId: string): Promise<string[]> {
  const rows = await prisma.uploadBatch.findMany({
    where: { uploadedBy: userId },
    orderBy: { createdAt: "desc" },
    select: { credit: true },
    take: 80,
  });
  const seen = new Set<string>();
  const credits: string[] = [];
  for (const row of rows) {
    const credit = row.credit.trim();
    if (!credit || seen.has(credit)) continue;
    seen.add(credit);
    credits.push(credit);
    if (credits.length >= 20) break;
  }
  return credits;
}

export async function listCollections() {
  return prisma.collection.findMany({
    orderBy: [{ isPersonal: "desc" }, { name: "asc" }],
    select: { id: true, name: true, isPersonal: true },
    take: 200,
  });
}

export async function listPersonalStagingAssets(userId: string) {
  return prisma.asset.findMany({
    where: { status: "staging", uploadedBy: userId },
    orderBy: [{ createdAt: "desc" }, { sequence: "asc" }],
    select: {
      id: true,
      fileName: true,
      credit: true,
      rating: true,
      editParams: true,
      altText: true,
      keywords: true,
      takenAt: true,
      width: true,
      height: true,
      rightsType: true,
      createdAt: true,
      collections: {
        select: {
          collection: { select: { id: true, name: true } },
        },
      },
      exports: wepublishExportLogSelect,
    },
  });
}

export function toPersonalAssetCard(
  row: Awaited<ReturnType<typeof listPersonalStagingAssets>>[number],
): PersonalAssetCard {
  return {
    id: row.id,
    fileName: row.fileName,
    credit: row.credit,
    rating: row.rating,
    editParams: parseEditParams(row.editParams),
    collections: row.collections.map((link) => link.collection),
    altText: row.altText,
    keywords: row.keywords,
    takenAt: row.takenAt ? row.takenAt.toISOString() : null,
    width: row.width,
    height: row.height,
    rightsType: row.rightsType,
    lastWepublishExportedAt: latestWepublishExportedAt(row.exports),
  };
}
