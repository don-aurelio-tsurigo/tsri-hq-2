import type { NewsItemStatus, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import {
  allFeedSources,
  sourceAutoFetchesFulltext,
  BAUGESUCHE_SOURCE,
  NEWS_ITEM_RETENTION_DAYS,
  TAGBLATT_SOURCE,
} from "@/lib/news-feed-constants";
import {
  collectFeedItems,
  enrichFeedItems,
  type ParsedNewsItem,
} from "@/lib/news-feed-fetch";

export type NewsFeedRow = {
  id: string;
  externalId: string;
  source: string;
  sourceLabel: string;
  title: string;
  link: string;
  summary: string | null;
  publishedAt: string | null;
  fetchedAt: string;
  status: NewsItemStatus;
};

export async function listNewsItems(
  organizationId: string,
  options?: {
    status?: NewsItemStatus | null;
    source?: string | null;
    take?: number;
  },
) {
  const take = Math.min(options?.take ?? 100, 200);
  const where: Prisma.NewsItemWhereInput = {
    organizationId,
    ...(options?.status ? { status: options.status } : {}),
    ...(options?.source ? { source: options.source } : {}),
  };

  const rows = await prisma.newsItem.findMany({
    where,
    orderBy: [{ publishedAt: "desc" }, { fetchedAt: "desc" }],
    take,
  });

  return rows.map(serializeNewsItem);
}

export async function countNewsItemsByStatus(organizationId: string) {
  const groups = await prisma.newsItem.groupBy({
    by: ["status"],
    where: { organizationId },
    _count: { _all: true },
  });
  const counts: Record<NewsItemStatus, number> = {
    neu: 0,
    interessant: 0,
    beobachten: 0,
    verworfen: 0,
  };
  for (const g of groups) {
    counts[g.status] = g._count._all;
  }
  return counts;
}

export function listConfiguredSources() {
  return allFeedSources();
}

function retentionCutoff(now = new Date()) {
  return new Date(
    now.getTime() - NEWS_ITEM_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  );
}

export function isNewsItemWithinRetention(
  item: { publishedAt: Date | null },
  now = new Date(),
) {
  if (!item.publishedAt) return true;
  return item.publishedAt.getTime() >= retentionCutoff(now).getTime();
}

/** Drop neu/verworfen rows past the retention window. Tracked items stay. */
export async function purgeExpiredNewsItems() {
  const cutoff = retentionCutoff();
  const result = await prisma.newsItem.deleteMany({
    where: {
      status: { in: ["neu", "verworfen"] },
      OR: [
        { publishedAt: { lt: cutoff } },
        { AND: [{ publishedAt: null }, { fetchedAt: { lt: cutoff } }] },
      ],
    },
  });
  return result.count;
}

export async function upsertNewsItems(
  organizationId: string,
  items: ParsedNewsItem[],
) {
  items = items.filter((item) => isNewsItemWithinRetention(item));
  if (items.length === 0) return 0;
  const fetchedAt = new Date();
  const batchSize = 50;
  let insertedApprox = 0;

  for (let i = 0; i < items.length; i += batchSize) {
    const chunk = items.slice(i, i + batchSize);
    const result = await prisma.newsItem.createMany({
      data: chunk.map((item) => ({
        organizationId,
        externalId: item.externalId,
        source: item.source,
        sourceLabel: item.sourceLabel,
        title: item.title,
        link: item.link,
        summary: item.summary || null,
        publishedAt: item.publishedAt,
        fetchedAt,
        status: "neu" as const,
      })),
      skipDuplicates: true,
    });
    insertedApprox += result.count;
  }

  // Bestehende Auto-Fulltext-Quellen: Summary mit nachgeladenem Volltext aktualisieren
  const fulltextUpdates = items.filter(
    (item) =>
      sourceAutoFetchesFulltext(item.source) &&
      (item.summary?.length ?? 0) >= 200,
  );
  for (const item of fulltextUpdates) {
    await prisma.newsItem.updateMany({
      where: { organizationId, externalId: item.externalId },
      data: {
        summary: item.summary,
        title: item.title,
        link: item.link,
        fetchedAt,
      },
    });
  }

  return insertedApprox;
}

export async function runNewsFeedFetch(organizationId: string) {
  const { items, results } = await collectFeedItems();
  const inserted = await upsertNewsItems(organizationId, items);
  return { results, fetched: items.length, inserted };
}

/** Fetch once and upsert for every organization (background scheduler). */
export async function runNewsFeedFetchForAllOrgs() {
  const orgs = await prisma.organization.findMany({
    select: { id: true },
  });

  // Cheap pass first (no article HTML / Amtsblatt XML) so a 512MB instance
  // does not re-download hundreds of detail pages when nothing is new.
  const { items: cheapItems, results } = await collectFeedItems({
    enrichDetails: false,
  });

  const existingRows = cheapItems.length
    ? await prisma.newsItem.findMany({
        where: { externalId: { in: cheapItems.map((item) => item.externalId) } },
        select: { externalId: true },
      })
    : [];
  const existingIds = new Set(existingRows.map((row) => row.externalId));
  const missing = cheapItems.filter(
    (item) =>
      !existingIds.has(item.externalId) && isNewsItemWithinRetention(item),
  );
  const needsEnrich = missing.filter(
    (item) =>
      sourceAutoFetchesFulltext(item.source) ||
      item.source === BAUGESUCHE_SOURCE.key ||
      item.source === TAGBLATT_SOURCE.key,
  );
  const enrichedNew = await enrichFeedItems(needsEnrich);
  const enrichedById = new Map(
    enrichedNew.map((item) => [item.externalId, item]),
  );

  const toUpsert = missing.flatMap((item) => {
    const needsDetail =
      sourceAutoFetchesFulltext(item.source) ||
      item.source === BAUGESUCHE_SOURCE.key ||
      item.source === TAGBLATT_SOURCE.key;
    if (!needsDetail) return [item];
    const enriched = enrichedById.get(item.externalId);
    if (!enriched) return [];
    if (item.source === TAGBLATT_SOURCE.key && !enriched.title) return [];
    return [enriched];
  });

  let inserted = 0;
  for (const org of orgs) {
    inserted += await upsertNewsItems(org.id, toUpsert);
  }

  const purged = await purgeExpiredNewsItems();

  return {
    orgs: orgs.length,
    fetched: cheapItems.length,
    inserted,
    missing: missing.length,
    enriched: enrichedNew.length,
    purged,
    results,
  };
}

export async function updateNewsItemStatus(
  organizationId: string,
  id: string,
  status: NewsItemStatus,
) {
  const existing = await prisma.newsItem.findFirst({
    where: { id, organizationId },
    select: { id: true },
  });
  if (!existing) return null;
  return prisma.newsItem.update({
    where: { id },
    data: { status },
  });
}

export async function bulkUpdateNewsItemStatus(
  organizationId: string,
  ids: string[],
  status: NewsItemStatus,
) {
  if (ids.length === 0) return 0;
  const result = await prisma.newsItem.updateMany({
    where: { organizationId, id: { in: ids } },
    data: { status },
  });
  return result.count;
}

function serializeNewsItem(row: {
  id: string;
  externalId: string;
  source: string;
  sourceLabel: string;
  title: string;
  link: string;
  summary: string | null;
  publishedAt: Date | null;
  fetchedAt: Date;
  status: NewsItemStatus;
}): NewsFeedRow {
  return {
    id: row.id,
    externalId: row.externalId,
    source: row.source,
    sourceLabel: row.sourceLabel,
    title: row.title,
    link: row.link,
    summary: row.summary,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    fetchedAt: row.fetchedAt.toISOString(),
    status: row.status,
  };
}
