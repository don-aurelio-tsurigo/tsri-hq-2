import type { Prisma } from "@/generated/prisma/client";
import {
  type ArchiveFilters,
  archiveFiltersActive,
  parseArchiveFilters,
} from "@/lib/dam/archive-filters";
import { prisma } from "@/lib/db";
import type { ArchiveAssetCard } from "@/lib/dam/types";

export type { ArchiveAssetCard, ArchiveFilters };
export { archiveFiltersActive, parseArchiveFilters };

async function publishedIdsMatchingFts(q: string): Promise<string[] | null> {
  const query = q.trim();
  if (!query) return null;
  try {
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id
      FROM "asset"
      WHERE status = 'published'::"AssetStatus"
        AND dam_asset_fts("fileName", "altText", "credit", keywords)
          @@ websearch_to_tsquery('simple'::regconfig, ${query})
      ORDER BY "publishedAt" DESC NULLS LAST, "createdAt" DESC
      LIMIT 500
    `;
    return rows.map((row) => row.id);
  } catch (error) {
    console.warn("[dam] archive FTS failed", error);
    return [];
  }
}

export async function searchPublishedAssets(
  filters: ArchiveFilters,
  limit = 120,
): Promise<ArchiveAssetCard[]> {
  const ftsIds = await publishedIdsMatchingFts(filters.q);
  if (ftsIds && ftsIds.length === 0) return [];

  const where: Prisma.AssetWhereInput = {
    status: "published",
    ...(ftsIds ? { id: { in: ftsIds } } : {}),
    ...(filters.keyword ? { keywords: { has: filters.keyword } } : {}),
    ...(filters.credit ? { credit: filters.credit } : {}),
    ...(filters.rightsType ? { rightsType: filters.rightsType } : {}),
    ...(filters.collectionId
      ? { collections: { some: { collectionId: filters.collectionId } } }
      : {}),
  };

  if (filters.from || filters.to) {
    where.takenAt = {
      ...(filters.from ? { gte: new Date(`${filters.from}T00:00:00`) } : {}),
      ...(filters.to ? { lte: new Date(`${filters.to}T23:59:59.999`) } : {}),
    };
  }

  const rows = await prisma.asset.findMany({
    where,
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    take: limit,
    select: {
      id: true,
      fileName: true,
      credit: true,
      rating: true,
      altText: true,
      keywords: true,
      takenAt: true,
      publishedAt: true,
      width: true,
      height: true,
      rightsType: true,
      collections: {
        select: { collection: { select: { id: true, name: true } } },
      },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    fileName: row.fileName,
    credit: row.credit,
    rating: row.rating,
    altText: row.altText,
    keywords: row.keywords,
    takenAt: row.takenAt ? row.takenAt.toISOString() : null,
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    width: row.width,
    height: row.height,
    rightsType: row.rightsType,
    collections: row.collections.map((link) => link.collection),
  }));
}

export async function countPublishedAssets(): Promise<number> {
  return prisma.asset.count({ where: { status: "published" } });
}

export async function listArchiveFacets() {
  const [credits, collections, keywordRows] = await Promise.all([
    prisma.asset.findMany({
      where: { status: "published" },
      distinct: ["credit"],
      select: { credit: true },
      orderBy: { credit: "asc" },
      take: 200,
    }),
    prisma.collection.findMany({
      where: { assets: { some: { asset: { status: "published" } } } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 200,
    }),
    prisma.$queryRaw<{ keyword: string }[]>`
      SELECT DISTINCT trim(k) AS keyword
      FROM "asset", unnest(keywords) AS k
      WHERE status = 'published'::"AssetStatus"
        AND trim(k) <> ''
      ORDER BY 1
      LIMIT 200
    `,
  ]);

  return {
    credits: credits.map((row) => row.credit).filter(Boolean),
    collections,
    keywords: keywordRows.map((row) => row.keyword).filter(Boolean),
  };
}
