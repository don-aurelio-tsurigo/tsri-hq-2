import { prisma } from "@/lib/db";
import { parseEditParams } from "@/lib/dam/edit-params";
import { latestWepublishExportedAt, wepublishExportLogSelect } from "@/lib/dam/export-wepublish";
import type { PersonalAssetCard } from "@/lib/dam/types";

export async function listKnownCredits(): Promise<string[]> {
  const rows = await prisma.asset.findMany({
    where: {
      deletedAt: null,
      status: { in: ["published", "staging", "archived"] },
    },
    distinct: ["credit"],
    select: { credit: true },
    orderBy: { credit: "asc" },
  });
  return rows.map((row) => row.credit.trim()).filter(Boolean);
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
      notes: true,
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
    notes: row.notes,
    takenAt: row.takenAt ? row.takenAt.toISOString() : null,
    width: row.width,
    height: row.height,
    rightsType: row.rightsType,
    lastWepublishExportedAt: latestWepublishExportedAt(row.exports),
  };
}
