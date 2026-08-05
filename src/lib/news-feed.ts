import type { NewsItemStatus, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { allFeedSources } from "@/lib/news-feed-constants";
import {
  collectFeedItems,
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

export async function upsertNewsItems(
  organizationId: string,
  items: ParsedNewsItem[],
) {
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

  return insertedApprox;
}

export async function runNewsFeedFetch(organizationId: string) {
  const { items, results } = await collectFeedItems();
  const inserted = await upsertNewsItems(organizationId, items);
  return { results, fetched: items.length, inserted };
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
