import { ARCHIVE_PAGE_SIZE } from "@/lib/dam/archive-filters";
import type { ArchiveCollectionCard } from "@/lib/dam/archive-search";
import { parseEditParams } from "@/lib/dam/edit-params";
import { latestWepublishExportedAt, wepublishExportLogSelect } from "@/lib/dam/export-wepublish";
import {
  EMPTY_REVIEW_FILTERS,
  isDamArchiveReviewReminderDay,
  parseReviewFilters,
  parseReviewOpenedAt,
  parseReviewView,
  reviewHref,
  reviewQueueWhere,
  type ReviewQueueFilters,
} from "@/lib/dam/review-params";
import { prisma } from "@/lib/db";
import type { ArchiveAssetCard } from "@/lib/dam/types";
import { hasExplicitTag, type MembershipWithGrants } from "@/lib/permissions";

export {
  EMPTY_REVIEW_FILTERS,
  isDamArchiveReviewReminderDay,
  parseReviewFilters,
  parseReviewOpenedAt,
  parseReviewView,
  reviewHref,
  reviewQueueWhere,
  type ReviewQueueFilters,
};

/** Weekly home reminder: only members tagged Redaktionsleitung (not admins by role). */
export function showDamArchiveReviewReminder(membership: MembershipWithGrants): boolean {
  return hasExplicitTag(membership, "editorial_lead");
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
  filters: ReviewQueueFilters = EMPTY_REVIEW_FILTERS,
): Promise<number> {
  return prisma.asset.count({
    where: reviewQueueWhere(reviewedUntil, openedAt, filters),
  });
}

export async function searchDamArchiveReviewQueue(
  reviewedUntil: Date,
  openedAt: Date,
  page = 1,
  pageSize = ARCHIVE_PAGE_SIZE,
  filters: ReviewQueueFilters = EMPTY_REVIEW_FILTERS,
): Promise<{
  assets: ArchiveAssetCard[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}> {
  const where = reviewQueueWhere(reviewedUntil, openedAt, filters);
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
        editParams: true,
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
      editParams: parseEditParams(row.editParams),
    })),
    total,
    page: safePage,
    pageSize,
    pageCount,
  };
}

export async function listDamArchiveReviewCollectionCards(
  reviewedUntil: Date,
  openedAt: Date,
  page = 1,
  pageSize = ARCHIVE_PAGE_SIZE,
  filters: Pick<ReviewQueueFilters, "rating"> = { rating: "all" },
): Promise<{
  collections: ArchiveCollectionCard[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}> {
  const assetWhere = reviewQueueWhere(reviewedUntil, openedAt, {
    rating: filters.rating,
    collectionId: "",
  });
  const where = {
    assets: { some: { asset: assetWhere } },
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
          where: { asset: assetWhere },
          orderBy: { asset: { publishedAt: "desc" } },
          take: 1,
          select: {
            asset: { select: { id: true, editParams: true } },
          },
        },
        _count: {
          select: {
            assets: { where: { asset: assetWhere } },
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
