import type { Prisma } from "@/generated/prisma/client";

const ZURICH_TZ = "Europe/Zurich";

/** Monthly home reminder day (clamped to the month's length, Europe/Zurich). */
export const DAM_ARCHIVE_REVIEW_REMINDER_DAY = 31;

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
