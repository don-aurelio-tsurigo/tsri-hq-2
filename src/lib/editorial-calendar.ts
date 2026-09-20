import { prisma } from "@/lib/db";
import {
  dateKey,
  dateKeyFromDb,
  listOccurrencesInYear,
  yearInSeries,
  type CalendarCategoryOption,
  type CalendarEventDetail,
  type CalendarEventFields,
  type PendingEvent,
  type ResolvedOccurrence,
} from "@/lib/editorial-calendar-shared";

export * from "@/lib/editorial-calendar-shared";

export async function listCalendarCategories(
  organizationId: string,
): Promise<CalendarCategoryOption[]> {
  const rows = await prisma.editorialCalendarCategory.findMany({
    where: { organizationId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    color: r.color,
    active: r.active,
    sortOrder: r.sortOrder,
  }));
}

export async function listYearCalendar(
  organizationId: string,
  year: number,
): Promise<{
  occurrences: ResolvedOccurrence[];
  pending: PendingEvent[];
  events: CalendarEventDetail[];
  categories: CalendarCategoryOption[];
}> {
  const [events, categories] = await Promise.all([
    prisma.editorialCalendarEvent.findMany({
      where: { organizationId, archivedAt: null },
      include: {
        category: { select: { id: true, name: true, color: true } },
        occurrences: {
          where: { year },
          take: 1,
        },
      },
      orderBy: [{ title: "asc" }],
    }),
    listCalendarCategories(organizationId),
  ]);

  const occurrences: ResolvedOccurrence[] = [];
  const pending: PendingEvent[] = [];
  const eventDetails: CalendarEventDetail[] = [];

  for (const event of events) {
    const fields: CalendarEventFields = {
      frequency: event.frequency,
      dateMode: event.dateMode,
      date: event.date,
      day: event.day,
      month: event.month,
      ruleWeekday: event.ruleWeekday,
      ruleNth: event.ruleNth,
      ruleMonth: event.ruleMonth,
      intervalYears: event.intervalYears,
      anchorYear: event.anchorYear,
    };

    const occ = event.occurrences[0] ?? null;
    const pendingDate = occ?.date ?? null;

    const isPendingYearly =
      event.dateMode === "pending" &&
      (event.frequency === "yearly" || event.frequency === "every_n_years");

    if (isPendingYearly) {
      const relevant =
        event.frequency === "yearly" ||
        yearInSeries(year, event.anchorYear, event.intervalYears);
      if (relevant && !pendingDate) {
        pending.push({
          id: event.id,
          title: event.title,
          note: event.note,
          frequency: event.frequency,
          intervalYears: event.intervalYears,
          category: event.category,
        });
      }
    }

    const dates = listOccurrencesInYear(fields, year, pendingDate);
    for (const d of dates) {
      occurrences.push({
        eventId: event.id,
        dateKey: dateKey(d),
        date: d,
        title: event.title,
        note: occ?.note ?? event.note,
        frequency: event.frequency,
        dateMode: event.dateMode,
        category: event.category,
      });
    }

    eventDetails.push({
      id: event.id,
      title: event.title,
      note: event.note,
      frequency: event.frequency,
      dateMode: event.dateMode,
      dateKey: event.date ? dateKeyFromDb(event.date) : null,
      day: event.day,
      month: event.month,
      ruleWeekday: event.ruleWeekday,
      ruleNth: event.ruleNth,
      ruleMonth: event.ruleMonth,
      intervalYears: event.intervalYears,
      anchorYear: event.anchorYear,
      categoryId: event.categoryId,
      occurrenceDateKey: pendingDate ? dateKeyFromDb(pendingDate) : null,
      occurrenceNote: occ?.note ?? null,
    });
  }

  occurrences.sort((a, b) => a.dateKey.localeCompare(b.dateKey));

  return {
    occurrences,
    pending,
    events: eventDetails,
    categories,
  };
}
