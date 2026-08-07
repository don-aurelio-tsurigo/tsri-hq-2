import { addDays, format, startOfDay } from "date-fns";
import { de } from "date-fns/locale";
import { prisma } from "@/lib/db";
import { getWeekMonday, parseWeekParam, toDateKey } from "@/lib/cooking";

export { getWeekMonday, parseWeekParam, toDateKey };

export function weekDays(monday: Date) {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

export function formatProgramDay(date: Date) {
  return format(date, "EEE d.M.", { locale: de });
}

export function formatWeekRange(monday: Date) {
  const sunday = addDays(monday, 6);
  return `${format(monday, "d. MMM", { locale: de })} – ${format(
    sunday,
    "d. MMM yyyy",
    { locale: de },
  )}`;
}

/** Scheduled articles for the redaktion program (have publishAt). */
export async function listProgramArticles(spaceId: string) {
  return prisma.task.findMany({
    where: {
      spaceId,
      kind: "article",
      status: { not: "cancelled" },
      archivedAt: null,
      publishAt: { not: null },
      OR: [{ stage: null }, { stage: { not: "abgelehnt" } }],
    },
    include: {
      assignee: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
      category: {
        select: { id: true, name: true, color: true, active: true },
      },
    },
    orderBy: [
      { publishAt: "asc" },
      { sortOrder: "asc" },
      { updatedAt: "desc" },
    ],
  });
}

/** Articles programmed for today across the org's Redaktion space. */
export async function listTodaysTsueriArticles(organizationId: string) {
  const redaktion = await prisma.space.findFirst({
    where: { organizationId, slug: "redaktion" },
    select: { id: true },
  });
  if (!redaktion) return [];

  const todayKey = toDateKey(new Date());
  const dayStart = new Date(`${todayKey}T00:00:00.000Z`);
  const dayEnd = new Date(`${todayKey}T23:59:59.999Z`);

  return prisma.task.findMany({
    where: {
      spaceId: redaktion.id,
      kind: "article",
      status: { not: "cancelled" },
      archivedAt: null,
      publishAt: { gte: dayStart, lte: dayEnd },
      OR: [{ stage: null }, { stage: { not: "abgelehnt" } }],
    },
    include: {
      assignee: { select: { id: true, name: true } },
      space: { select: { id: true, name: true } },
    },
    orderBy: [
      { sortOrder: "asc" },
      { updatedAt: "desc" },
    ],
  });
}

export function isSameDayKey(date: Date | null | undefined, dateKey: string) {
  if (!date) return false;
  return toDateKey(date) === dateKey;
}

export function startOfToday() {
  return startOfDay(new Date());
}
