import {
  addDays,
  format,
  parseISO,
  startOfWeek,
  isTuesday,
  isWednesday,
  isThursday,
  isFriday,
} from "date-fns";
import { de } from "date-fns/locale";
import { prisma } from "@/lib/db";

/** Cooking weekdays: Tue=2 .. Fri=5 (date-fns: Sunday=0) */
export const COOKING_WEEKDAYS = [2, 3, 4, 5] as const;

export function getWeekMonday(reference: Date = new Date()) {
  return startOfWeek(reference, { weekStartsOn: 1 });
}

export function parseWeekParam(week: string | undefined | null) {
  if (!week) return getWeekMonday();
  try {
    const parsed = parseISO(week);
    if (Number.isNaN(parsed.getTime())) return getWeekMonday();
    return getWeekMonday(parsed);
  } catch {
    return getWeekMonday();
  }
}

/** Full calendar week Monday–Sunday for display. */
export function weekDatesForWeek(monday: Date) {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** Cooking signup days only (Tue–Fri). */
export function cookingDatesForWeek(monday: Date) {
  return COOKING_WEEKDAYS.map((weekday) => {
    // monday is day 1; tuesday offset 1, ... friday offset 4
    const offset = weekday - 1;
    return addDays(monday, offset);
  });
}

export function isCookingWeekday(date: Date) {
  return (
    isTuesday(date) ||
    isWednesday(date) ||
    isThursday(date) ||
    isFriday(date)
  );
}

export function formatCookingDay(date: Date) {
  return format(date, "EEEE, d. MMM", { locale: de });
}

export function toDateKey(date: Date) {
  return format(date, "yyyy-MM-dd");
}

export async function listCookingSlots(
  spaceId: string,
  from: Date,
  to: Date,
) {
  return prisma.cookingSlot.findMany({
    where: {
      spaceId,
      date: { gte: from, lte: to },
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
    orderBy: { date: "asc" },
  });
}

export async function listUpcomingCookingForUser(
  organizationId: string,
  userId: string,
  from: Date,
  limit = 4,
) {
  return prisma.cookingSlot.findMany({
    where: {
      userId,
      date: { gte: from },
      space: { organizationId, slug: "kochplan" },
    },
    include: {
      space: { select: { id: true, name: true } },
    },
    orderBy: { date: "asc" },
    take: limit,
  });
}
