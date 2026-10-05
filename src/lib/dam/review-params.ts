import type { Prisma } from "@/generated/prisma/client";
import {
  ARCHIVE_NO_COLLECTION,
  type ArchiveView,
} from "@/lib/dam/archive-filters";
import {
  parseRatingFilterParam,
  ratingFilterToParam,
  type RatingFilter,
} from "@/lib/dam/rating-filter";

const ZURICH_TZ = "Europe/Zurich";

/** Monthly home reminder day (clamped to the month's length, Europe/Zurich). */
export const DAM_ARCHIVE_REVIEW_REMINDER_DAY = 31;

export type ReviewQueueFilters = {
  rating: RatingFilter;
  collectionId: string;
};

export const EMPTY_REVIEW_FILTERS: ReviewQueueFilters = {
  rating: "all",
  collectionId: "",
};

function one(
  params: Record<string, string | string[] | undefined>,
  key: string,
): string {
  const value = params[key];
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value) && typeof value[0] === "string") return value[0].trim();
  return "";
}

function zurichCalendarParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: ZURICH_TZ,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  const read = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { year: read("year"), month: read("month"), day: read("day") };
}

export function isDamArchiveReviewReminderDay(now = new Date()): boolean {
  const { year, month, day } = zurichCalendarParts(now);
  const lastDayOfMonth = new Date(year, month, 0).getDate();
  const reminderDay = Math.min(DAM_ARCHIVE_REVIEW_REMINDER_DAY, lastDayOfMonth);
  return day === reminderDay;
}

function ratingClause(filter: RatingFilter): Prisma.AssetWhereInput | undefined {
  if (filter === "all") return undefined;
  const target = Number(filter.slice(2));
  if (target === 0) {
    return { OR: [{ rating: null }, { rating: 0 }] };
  }
  return { rating: target };
}

export function reviewQueueWhere(
  reviewedUntil: Date,
  openedAt: Date,
  filters: ReviewQueueFilters = EMPTY_REVIEW_FILTERS,
): Prisma.AssetWhereInput {
  const and: Prisma.AssetWhereInput[] = [];
  const rating = ratingClause(filters.rating);
  if (rating) and.push(rating);
  if (filters.collectionId === ARCHIVE_NO_COLLECTION) {
    and.push({ collections: { none: {} } });
  } else if (filters.collectionId) {
    and.push({ collections: { some: { collectionId: filters.collectionId } } });
  }

  return {
    status: "published",
    publishedAt: { gt: reviewedUntil, lte: openedAt },
    ...(and.length > 0 ? { AND: and } : {}),
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

/** Review defaults to collections when `view` is missing. */
export function parseReviewView(
  params: Record<string, string | string[] | undefined>,
): ArchiveView {
  return one(params, "view") === "photos" ? "photos" : "collections";
}

export function parseReviewFilters(
  params: Record<string, string | string[] | undefined>,
): ReviewQueueFilters {
  return {
    rating: parseRatingFilterParam(one(params, "rating")),
    collectionId: one(params, "collection"),
  };
}

export type ReviewHrefOpts = {
  page?: number;
  view?: ArchiveView;
  rating?: RatingFilter;
  collectionId?: string;
};

export function reviewHref(openedAt: Date, opts: ReviewHrefOpts | number = {}): string {
  // Back-compat: reviewHref(openedAt, pageNumber)
  const normalized: ReviewHrefOpts =
    typeof opts === "number" ? { page: opts } : opts;
  const params = new URLSearchParams();
  params.set("opened", openedAt.toISOString());
  const view = normalized.view ?? "collections";
  if (view === "photos") params.set("view", "photos");
  else params.set("view", "collections");
  const rating = ratingFilterToParam(normalized.rating ?? "all");
  if (rating) params.set("rating", rating);
  if (normalized.collectionId) params.set("collection", normalized.collectionId);
  if ((normalized.page ?? 1) > 1) params.set("page", String(normalized.page));
  return `/dam/review?${params}`;
}
