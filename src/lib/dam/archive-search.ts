import type { Prisma } from "@/generated/prisma/client";
import {
  ARCHIVE_FACET_LIMIT,
  ARCHIVE_FACET_SEARCH_LIMIT,
  ARCHIVE_PAGE_SIZE,
  type ArchiveFilters,
} from "@/lib/dam/archive-filters";
import { prisma } from "@/lib/db";
import { latestWepublishExportedAt, wepublishExportLogSelect } from "@/lib/dam/export-wepublish";
import type { ArchiveAssetCard } from "@/lib/dam/types";

export type { ArchiveAssetCard, ArchiveFilters };
export {
  ARCHIVE_PAGE_SIZE,
  archiveCollectionHref,
  archiveFilterChipCount,
  archiveFiltersActive,
  archiveFiltersToSearchParams,
  archiveHref,
  hiddenArchiveFilterCount,
  parseArchiveFilters,
  parseArchiveFiltersFromSearchParams,
  parseArchivePage,
  parseArchivePageFromSearchParams,
} from "@/lib/dam/archive-filters";

export type ArchiveFacetOption = { value: string; label: string };

export type ArchiveFacets = {
  credits: string[];
  collections: { id: string; name: string }[];
  keywords: string[];
  collectionsTruncated: boolean;
  keywordsTruncated: boolean;
};

async function publishedIdsMatchingFts(q: string): Promise<string[] | null> {
  const query = q.trim();
  if (!query) return null;
  try {
    // Keep in sync with dam_asset_fts() in prisma/migrations (fileName, altText, credit, keywords, notes).
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id
      FROM "asset"
      WHERE status = 'published'::"AssetStatus"
        AND dam_asset_fts("fileName", "altText", "credit", keywords, notes)
          @@ websearch_to_tsquery('simple'::regconfig, ${query})
      ORDER BY "takenAt" DESC NULLS LAST, "publishedAt" DESC NULLS LAST, "createdAt" DESC
      LIMIT 20000
    `;
    return rows.map((row) => row.id);
  } catch (error) {
    console.warn("[dam] archive FTS failed", error);
    return [];
  }
}

export type ArchiveSearchResult = {
  assets: ArchiveAssetCard[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

function publishedWhere(
  filters: ArchiveFilters,
  ftsIds: string[] | null,
): Prisma.AssetWhereInput {
  const where: Prisma.AssetWhereInput = {
    status: "published",
    ...(ftsIds ? { id: { in: ftsIds } } : {}),
    ...(filters.keywords.length > 0
      ? { OR: filters.keywords.map((keyword) => ({ keywords: { has: keyword } })) }
      : {}),
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

  return where;
}

export async function searchPublishedAssets(
  filters: ArchiveFilters,
  page = 1,
  pageSize = ARCHIVE_PAGE_SIZE,
): Promise<ArchiveSearchResult> {
  const ftsIds = await publishedIdsMatchingFts(filters.q);
  if (ftsIds && ftsIds.length === 0) {
    return { assets: [], total: 0, page: 1, pageSize, pageCount: 0 };
  }

  const where = publishedWhere(filters, ftsIds);
  const safePage = Math.max(1, page);
  const skip = (safePage - 1) * pageSize;

  const [total, rows] = await Promise.all([
    prisma.asset.count({ where }),
    prisma.asset.findMany({
      where,
      orderBy: [
        { takenAt: { sort: "desc", nulls: "last" } },
        { publishedAt: { sort: "desc", nulls: "last" } },
        { createdAt: "desc" },
      ],
      skip,
      take: pageSize,
      select: {
        id: true,
        fileName: true,
        credit: true,
        rating: true,
        altText: true,
        keywords: true,
        notes: true,
        takenAt: true,
        publishedAt: true,
        width: true,
        height: true,
        rightsType: true,
        collections: {
          select: { collection: { select: { id: true, name: true } } },
        },
        exports: wepublishExportLogSelect,
      },
    }),
  ]);

  const pageCount = total === 0 ? 0 : Math.ceil(total / pageSize);

  return {
    assets: rows.map((row) => ({
      id: row.id,
      fileName: row.fileName,
      credit: row.credit,
      rating: row.rating,
      altText: row.altText,
      keywords: row.keywords,
      notes: row.notes,
      takenAt: row.takenAt ? row.takenAt.toISOString() : null,
      publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
      width: row.width,
      height: row.height,
      rightsType: row.rightsType,
      collections: row.collections.map((link) => link.collection),
      lastWepublishExportedAt: latestWepublishExportedAt(row.exports),
    })),
    total,
    page: safePage,
    pageSize,
    pageCount,
  };
}

export async function countPublishedAssets(): Promise<number> {
  return prisma.asset.count({ where: { status: "published" } });
}

export async function listArchiveFacets(): Promise<ArchiveFacets> {
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
      take: ARCHIVE_FACET_LIMIT,
    }),
    prisma.$queryRaw<{ keyword: string }[]>`
      SELECT DISTINCT trim(k) AS keyword
      FROM "asset", unnest(keywords) AS k
      WHERE status = 'published'::"AssetStatus"
        AND trim(k) <> ''
      ORDER BY 1
      LIMIT ${ARCHIVE_FACET_LIMIT}
    `,
  ]);

  return {
    credits: credits.map((row) => row.credit).filter(Boolean),
    collections,
    keywords: keywordRows.map((row) => row.keyword).filter(Boolean),
    collectionsTruncated: collections.length >= ARCHIVE_FACET_LIMIT,
    keywordsTruncated: keywordRows.length >= ARCHIVE_FACET_LIMIT,
  };
}

function likeQuery(q: string): string {
  return `%${q.replace(/[%_]/g, "")}%`;
}

export async function searchArchiveKeywords(
  q: string,
  take = ARCHIVE_FACET_SEARCH_LIMIT,
): Promise<ArchiveFacetOption[]> {
  const query = q.trim().slice(0, 80);
  if (!query) return [];
  const rows = await prisma.$queryRaw<{ keyword: string }[]>`
    SELECT DISTINCT trim(k) AS keyword
    FROM "asset", unnest(keywords) AS k
    WHERE status = 'published'::"AssetStatus"
      AND trim(k) <> ''
      AND trim(k) ILIKE ${likeQuery(query)}
    ORDER BY 1
    LIMIT ${take}
  `;
  return rows
    .map((row) => row.keyword)
    .filter(Boolean)
    .map((keyword) => ({ value: keyword, label: keyword }));
}

export async function searchArchiveCollections(
  q: string,
  take = ARCHIVE_FACET_SEARCH_LIMIT,
): Promise<ArchiveFacetOption[]> {
  const query = q.trim().slice(0, 80);
  if (!query) return [];
  const rows = await prisma.collection.findMany({
    where: {
      assets: { some: { asset: { status: "published" } } },
      name: { contains: query, mode: "insensitive" },
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
    take,
  });
  return rows.map((row) => ({ value: row.id, label: row.name }));
}
