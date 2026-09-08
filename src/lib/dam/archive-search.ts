import type { Prisma } from "@/generated/prisma/client";
import { Prisma as PrismaSql } from "@/generated/prisma/client";
import {
  archiveSearchPhrase,
  buildArchiveFtsQuery,
  tokenizeArchiveQuery,
} from "@/lib/dam/archive-fts-query";
import {
  ARCHIVE_FACET_LIMIT,
  ARCHIVE_FACET_SEARCH_LIMIT,
  ARCHIVE_PAGE_SIZE,
  type ArchiveFilters,
} from "@/lib/dam/archive-filters";
import { prisma } from "@/lib/db";
import { parseEditParams } from "@/lib/dam/edit-params";
import { latestWepublishExportedAt, wepublishExportLogSelect } from "@/lib/dam/export-wepublish";
import type { ArchiveAssetCard } from "@/lib/dam/types";

export type { ArchiveAssetCard, ArchiveFilters };
export {
  ARCHIVE_PAGE_SIZE,
  archiveCollectionHref,
  archiveCollectionsHref,
  archiveFilterChipCount,
  archiveFiltersActive,
  archiveFiltersToSearchParams,
  archiveHref,
  hiddenArchiveFilterCount,
  parseArchiveFilters,
  parseArchiveFiltersFromSearchParams,
  parseArchivePage,
  parseArchivePageFromSearchParams,
  parseArchiveView,
  type ArchiveView,
} from "@/lib/dam/archive-filters";

export type ArchiveFacetOption = { value: string; label: string };

export type ArchiveFacets = {
  credits: string[];
  collections: { id: string; name: string }[];
  keywords: string[];
  collectionsTruncated: boolean;
  keywordsTruncated: boolean;
};

export type ArchiveSearchResult = {
  assets: ArchiveAssetCard[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  /** True when AND found nothing and OR fallback returned hits. */
  relaxedMatch?: boolean;
};

const assetCardSelect = {
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
  editParams: true,
  collections: {
    select: { collection: { select: { id: true, name: true } } },
  },
  exports: wepublishExportLogSelect,
} satisfies Prisma.AssetSelect;

function mapAssetCard(
  row: {
    id: string;
    fileName: string;
    credit: string;
    rating: number | null;
    altText: string | null;
    keywords: string[];
    notes: string | null;
    takenAt: Date | null;
    publishedAt: Date | null;
    width: number | null;
    height: number | null;
    rightsType: ArchiveAssetCard["rightsType"];
    editParams: unknown;
    collections: { collection: { id: string; name: string } }[];
    exports: { exportedAt: Date; targetUrl: string | null }[];
  },
  searchHeadline?: string | null,
): ArchiveAssetCard {
  return {
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
    editParams: parseEditParams(row.editParams),
    ...(searchHeadline ? { searchHeadline } : {}),
  };
}

function facetWhereSql(filters: ArchiveFilters): PrismaSql.Sql {
  const parts: PrismaSql.Sql[] = [PrismaSql.sql`a.status = 'published'::"AssetStatus"`];
  if (filters.credit) {
    parts.push(PrismaSql.sql`a.credit = ${filters.credit}`);
  }
  if (filters.rightsType) {
    parts.push(
      PrismaSql.sql`a."rightsType" = ${filters.rightsType}::"RightsType"`,
    );
  }
  if (filters.collectionId) {
    parts.push(PrismaSql.sql`EXISTS (
      SELECT 1 FROM "asset_collection" ac_f
      WHERE ac_f."assetId" = a.id AND ac_f."collectionId" = ${filters.collectionId}
    )`);
  }
  if (filters.keywords.length > 0) {
    const keywordMatches = filters.keywords.map(
      (keyword) => PrismaSql.sql`${keyword} = ANY (a.keywords)`,
    );
    parts.push(PrismaSql.sql`(${PrismaSql.join(keywordMatches, " OR ")})`);
  }
  if (filters.from) {
    parts.push(
      PrismaSql.sql`a."takenAt" >= ${new Date(`${filters.from}T00:00:00`)}`,
    );
  }
  if (filters.to) {
    parts.push(
      PrismaSql.sql`a."takenAt" <= ${new Date(`${filters.to}T23:59:59.999`)}`,
    );
  }
  return PrismaSql.join(parts, " AND ");
}

/** Indexed document used for both match (GIN) and cheap ranking. */
const INDEXED_DOCUMENT_SQL = PrismaSql.sql`
  dam_asset_fts(a."fileName", a."altText", a.credit, a.keywords, a.notes)
`;

/**
 * GIN match on the asset, plus collection hits evaluated from the small
 * collection set first (avoids per-asset to_tsvector).
 */
function ftsMatchSql(ftsQuery: string): PrismaSql.Sql {
  return PrismaSql.sql`(
    ${INDEXED_DOCUMENT_SQL} @@ to_tsquery('simple'::regconfig, ${ftsQuery})
    OR a.id IN (
      SELECT ac."assetId"
      FROM "collection" c
      INNER JOIN "asset_collection" ac ON ac."collectionId" = c.id
      WHERE to_tsvector('simple'::regconfig, public.dam_search_normalize(c.name))
        @@ to_tsquery('simple'::regconfig, ${ftsQuery})
    )
  )`;
}

/**
 * Prefer editorial phrase hits, then index rank, then upload time.
 * Single round-trip (window count); no ts_headline on the hot path.
 */
async function rankedFtsPage(
  filters: ArchiveFilters,
  ftsQuery: string,
  page: number,
  pageSize: number,
  rawQuery: string,
): Promise<{ ids: string[]; headlines: Map<string, string>; total: number }> {
  const whereSql = facetWhereSql(filters);
  const matchSql = ftsMatchSql(ftsQuery);
  const phrase = archiveSearchPhrase(rawQuery);
  const phrasePattern = phrase ? `%${phrase}%` : null;
  const safePage = Math.max(1, page);
  const skip = (safePage - 1) * pageSize;

  // One normalized haystack for phrase boost — no per-field EXISTS in ORDER BY.
  const phraseBoostSql = phrasePattern
    ? PrismaSql.sql`(
        CASE
          WHEN public.dam_search_normalize(
            concat_ws(
              ' ',
              coalesce(a.notes, ''),
              coalesce(a."altText", ''),
              coalesce(array_to_string(a.keywords, ' '), ''),
              coalesce(a."fileName", '')
            )
          ) LIKE ${phrasePattern} THEN 1
          ELSE 0
        END
      )`
    : PrismaSql.sql`0`;

  const pageRows = await prisma.$queryRaw<
    { id: string; total: bigint; snippet: string | null }[]
  >`
    SELECT
      a.id,
      COUNT(*) OVER()::bigint AS total,
      NULLIF(
        left(
          coalesce(
            NULLIF(trim(a.notes), ''),
            NULLIF(trim(a."altText"), ''),
            NULLIF(trim(array_to_string(a.keywords, ', ')), '')
          ),
          160
        ),
        ''
      ) AS snippet
    FROM "asset" a
    WHERE ${whereSql}
      AND ${matchSql}
    ORDER BY
      ${phraseBoostSql} DESC,
      ts_rank(${INDEXED_DOCUMENT_SQL}, to_tsquery('simple'::regconfig, ${ftsQuery})) DESC,
      a."createdAt" DESC
    LIMIT ${pageSize}
    OFFSET ${skip}
  `;

  const total = pageRows.length > 0 ? Number(pageRows[0]?.total ?? 0) : 0;
  // Empty page but not first page: still need a total — cheap count only then.
  let resolvedTotal = total;
  if (pageRows.length === 0 && skip > 0) {
    const countRows = await prisma.$queryRaw<{ total: bigint }[]>`
      SELECT COUNT(*)::bigint AS total
      FROM "asset" a
      WHERE ${whereSql}
        AND ${matchSql}
    `;
    resolvedTotal = Number(countRows[0]?.total ?? 0);
  } else if (pageRows.length === 0) {
    resolvedTotal = 0;
  }

  const headlines = new Map<string, string>();
  for (const row of pageRows) {
    if (row.snippet?.trim()) headlines.set(row.id, row.snippet.trim());
  }

  return {
    ids: pageRows.map((row) => row.id),
    headlines,
    total: resolvedTotal,
  };
}

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

export type ArchiveCollectionCard = {
  id: string;
  name: string;
  assetCount: number;
  preview: { id: string; editParams: ReturnType<typeof parseEditParams> } | null;
};

export type ArchiveCollectionCardsResult = {
  collections: ArchiveCollectionCard[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export async function listArchiveCollectionCards(
  q = "",
  page = 1,
  pageSize = ARCHIVE_PAGE_SIZE,
): Promise<ArchiveCollectionCardsResult> {
  const query = q.trim().slice(0, 120);
  const where = {
    assets: { some: { asset: { status: "published" as const } } },
    ...(query ? { name: { contains: query, mode: "insensitive" as const } } : {}),
  };
  const safePage = Math.max(1, page);
  const skip = (safePage - 1) * pageSize;

  const [total, rows] = await Promise.all([
    prisma.collection.count({ where }),
    prisma.collection.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { name: "asc" }],
      skip,
      take: pageSize,
      select: {
        id: true,
        name: true,
        assets: {
          where: { asset: { status: "published" } },
          orderBy: { asset: { takenAt: "desc" } },
          take: 1,
          select: {
            asset: { select: { id: true, editParams: true } },
          },
        },
        _count: {
          select: {
            assets: { where: { asset: { status: "published" } } },
          },
        },
      },
    }),
  ]);

  const pageCount = total === 0 ? 0 : Math.ceil(total / pageSize);

  return {
    collections: rows.map((row) => ({
      id: row.id,
      name: row.name,
      assetCount: row._count.assets,
      preview: row.assets[0]?.asset
        ? {
            id: row.assets[0].asset.id,
            editParams: parseEditParams(row.assets[0].asset.editParams),
          }
        : null,
    })),
    total,
    page: safePage,
    pageSize,
    pageCount,
  };
}

export async function searchPublishedAssets(
  filters: ArchiveFilters,
  page = 1,
  pageSize = ARCHIVE_PAGE_SIZE,
): Promise<ArchiveSearchResult> {
  const safePage = Math.max(1, page);
  const andQuery = buildArchiveFtsQuery(filters.q, "and");

  if (andQuery) {
    try {
      let ranked = await rankedFtsPage(
        filters,
        andQuery,
        safePage,
        pageSize,
        filters.q,
      );
      let relaxedMatch = false;
      const tokenCount = tokenizeArchiveQuery(filters.q).length;
      if (ranked.total === 0 && tokenCount > 1) {
        const orQuery = buildArchiveFtsQuery(filters.q, "or");
        if (orQuery) {
          ranked = await rankedFtsPage(
            filters,
            orQuery,
            safePage,
            pageSize,
            filters.q,
          );
          relaxedMatch = ranked.total > 0;
        }
      }

      if (ranked.total === 0 || ranked.ids.length === 0) {
        return {
          assets: [],
          total: 0,
          page: 1,
          pageSize,
          pageCount: 0,
          relaxedMatch: false,
        };
      }

      const rows = await prisma.asset.findMany({
        where: { id: { in: ranked.ids } },
        select: assetCardSelect,
      });
      const byId = new Map(rows.map((row) => [row.id, row]));
      const assets = ranked.ids
        .map((id) => {
          const row = byId.get(id);
          if (!row) return null;
          return mapAssetCard(row, ranked.headlines.get(id) ?? null);
        })
        .filter((row): row is ArchiveAssetCard => Boolean(row));

      return {
        assets,
        total: ranked.total,
        page: safePage,
        pageSize,
        pageCount: Math.ceil(ranked.total / pageSize),
        relaxedMatch,
      };
    } catch (error) {
      console.warn("[dam] archive FTS failed", error);
      return { assets: [], total: 0, page: 1, pageSize, pageCount: 0 };
    }
  }

  const where = publishedWhere(filters, null);
  const skip = (safePage - 1) * pageSize;

  const [total, rows] = await Promise.all([
    prisma.asset.count({ where }),
    prisma.asset.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      skip,
      take: pageSize,
      select: assetCardSelect,
    }),
  ]);

  const pageCount = total === 0 ? 0 : Math.ceil(total / pageSize);

  return {
    assets: rows.map((row) => mapAssetCard(row)),
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
      orderBy: [{ createdAt: "desc" }, { name: "asc" }],
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
    orderBy: [{ createdAt: "desc" }, { name: "asc" }],
    take,
  });
  return rows.map((row) => ({ value: row.id, label: row.name }));
}
