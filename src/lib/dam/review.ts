import { ARCHIVE_PAGE_SIZE } from "@/lib/dam/archive-filters";
import {
  parseReviewOpenedAt,
  reviewHref,
  reviewQueueWhere,
} from "@/lib/dam/review-params";
import { prisma } from "@/lib/db";
import { latestWepublishExportedAt, wepublishExportLogSelect } from "@/lib/dam/export-wepublish";
import type { ArchiveAssetCard } from "@/lib/dam/types";
import { canManageEditorial, type MembershipWithGrants } from "@/lib/permissions";

export {
  parseReviewOpenedAt,
  reviewHref,
  reviewQueueWhere,
};

export function canReviewDamArchive(membership: MembershipWithGrants): boolean {
  return canManageEditorial(membership);
}

export async function getLastDamArchiveReview() {
  return prisma.damArchiveReview.findFirst({
    orderBy: { completedAt: "desc" },
    select: {
      id: true,
      reviewedUntil: true,
      completedAt: true,
      remainingCount: true,
    },
  });
}

export async function countDamArchiveReviewQueue(
  reviewedUntil: Date,
  openedAt = new Date(),
): Promise<number> {
  return prisma.asset.count({
    where: reviewQueueWhere(reviewedUntil, openedAt),
  });
}

export async function searchDamArchiveReviewQueue(
  reviewedUntil: Date,
  openedAt: Date,
  page = 1,
  pageSize = ARCHIVE_PAGE_SIZE,
): Promise<{
  assets: ArchiveAssetCard[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}> {
  const where = reviewQueueWhere(reviewedUntil, openedAt);
  const safePage = Math.max(1, page);
  const skip = (safePage - 1) * pageSize;
  const [total, rows] = await Promise.all([
    prisma.asset.count({ where }),
    prisma.asset.findMany({
      where,
      orderBy: [{ publishedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
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
