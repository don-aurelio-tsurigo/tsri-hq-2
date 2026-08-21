import type { Prisma } from "@/generated/prisma/client";

export function reviewQueueWhere(
  reviewedUntil: Date,
  openedAt: Date,
): Prisma.AssetWhereInput {
  return {
    status: "published",
    publishedAt: { gt: reviewedUntil, lte: openedAt },
  };
}

export function parseReviewOpenedAt(raw: string | undefined): Date | null {
  if (!raw?.trim()) return null;
  const openedAt = new Date(raw);
  if (Number.isNaN(openedAt.getTime())) return null;
  const skewMs = 2 * 60 * 1000;
  if (openedAt.getTime() > Date.now() + skewMs) return null;
  return openedAt;
}

export function reviewHref(openedAt: Date, page = 1): string {
  const params = new URLSearchParams();
  params.set("opened", openedAt.toISOString());
  if (page > 1)   params.set("page", String(page));
  return `/dam/review?${params}`;
}
