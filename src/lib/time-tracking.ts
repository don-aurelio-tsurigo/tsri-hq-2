import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isWeekend,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { de } from "date-fns/locale";
import { prisma } from "@/lib/db";
import {
  computeWorkedHours,
  dailyTargetHours,
  formatSegmentsSummary,
  TIME_ENTRY_TYPE_LABELS,
  toTimeDateKey,
  type TimeEntryTypeValue,
  type TimeSegmentInput,
} from "@/lib/time-tracking-constants";

export { TIME_ENTRY_TYPE_LABELS };

export type TimeSegmentRow = TimeSegmentInput & {
  id?: string;
  sortOrder: number;
};

export type TimeEntryRow = {
  id: string;
  date: Date;
  type: TimeEntryTypeValue;
  note: string | null;
  segments: TimeSegmentRow[];
};

/** Western Easter Sunday (Anonymous Gregorian algorithm). */
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

/** Public holidays relevant for Zürich / common CH (fixed + movable). */
export function zhPublicHolidays(year: number): Map<string, string> {
  const easter = easterSunday(year);
  const entries: [Date, string][] = [
    [new Date(Date.UTC(year, 0, 1, 12)), "Neujahr"],
    [new Date(Date.UTC(year, 0, 2, 12)), "Berchtoldstag"],
    [addDays(easter, -2), "Karfreitag"],
    [addDays(easter, 1), "Ostermontag"],
    [new Date(Date.UTC(year, 4, 1, 12)), "Tag der Arbeit"],
    [addDays(easter, 39), "Auffahrt"],
    [addDays(easter, 50), "Pfingstmontag"],
    [new Date(Date.UTC(year, 7, 1, 12)), "Bundesfeier"],
    [new Date(Date.UTC(year, 11, 25, 12)), "Weihnachten"],
    [new Date(Date.UTC(year, 11, 26, 12)), "Stephanstag"],
  ];
  const map = new Map<string, string>();
  for (const [date, name] of entries) {
    map.set(toTimeDateKey(date), name);
  }
  return map;
}

export function holidayNameForDate(date: Date): string | null {
  const key = toTimeDateKey(date);
  const year = Number(key.slice(0, 4));
  return zhPublicHolidays(year).get(key) ?? null;
}

function isWeekday(date: Date): boolean {
  return !isWeekend(date);
}

/** Worked hours for a day entry. Absences / empty segments → 0. */
export function entryWorkedHours(entry: TimeEntryRow | null): number {
  if (!entry || entry.type !== "work") return 0;
  return computeWorkedHours(entry.segments);
}

export function entryHasOpenSegment(entry: TimeEntryRow | null): boolean {
  if (!entry || entry.type !== "work") return false;
  return entry.segments.some((s) => !s.endTime);
}

export function entrySegmentsLabel(entry: TimeEntryRow | null): string | null {
  if (!entry || entry.type !== "work") return null;
  return formatSegmentsSummary(entry.segments);
}

/** Soll for a calendar day (Mo–Fr, not public holiday). */
export function daySollHours(date: Date, pensumPercent: number): number {
  if (!isWeekday(date)) return 0;
  if (holidayNameForDate(date)) return 0;
  return dailyTargetHours(pensumPercent);
}

export type DaySummary = {
  dateKey: string;
  date: Date;
  weekdayLabel: string;
  isWeekend: boolean;
  holidayName: string | null;
  /** Potenzielles Tages-Soll (0 an WE/Feiertagen). */
  baseSollHours: number;
  /** Zählt nach Abwesenheit: Krank/Ferien senken das Soll (wie Excel). */
  sollHours: number;
  /** Nur effektiv gearbeitete Stunden (Typ Arbeit, Summe der Segmente). */
  workedHours: number;
  entry: TimeEntryRow | null;
};

export type PeriodSummary = {
  sollHours: number;
  istHours: number;
  diffHours: number;
  sickDays: number;
  vacationDays: number;
  days: DaySummary[];
};

function toEntryRow(row: {
  id: string;
  date: Date;
  type: string;
  note: string | null;
  segments: {
    id: string;
    startTime: string;
    endTime: string | null;
    sortOrder: number;
  }[];
}): TimeEntryRow {
  return {
    id: row.id,
    date: row.date,
    type: row.type as TimeEntryTypeValue,
    note: row.note,
    segments: row.segments
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder || a.startTime.localeCompare(b.startTime))
      .map((s) => ({
        id: s.id,
        startTime: s.startTime,
        endTime: s.endTime,
        sortOrder: s.sortOrder,
      })),
  };
}

export function summarizePeriod(
  start: Date,
  end: Date,
  entries: TimeEntryRow[],
  pensumPercent: number,
): PeriodSummary {
  const byKey = new Map(
    entries.map((e) => [toTimeDateKey(e.date), e] as const),
  );
  const days = eachDayOfInterval({ start, end }).map((date) => {
    const dateKey = toTimeDateKey(date);
    const holidayName = holidayNameForDate(date);
    const entry = byKey.get(dateKey) ?? null;
    const baseSollHours = daySollHours(date, pensumPercent);
    const absent =
      entry?.type === "sick" || entry?.type === "vacation";
    return {
      dateKey,
      date,
      weekdayLabel: format(date, "EEE", { locale: de }),
      isWeekend: isWeekend(date),
      holidayName,
      baseSollHours,
      sollHours: absent ? 0 : baseSollHours,
      workedHours: entryWorkedHours(entry),
      entry,
    } satisfies DaySummary;
  });

  const sollHours =
    Math.round(days.reduce((sum, d) => sum + d.sollHours, 0) * 100) / 100;
  const istHours =
    Math.round(days.reduce((sum, d) => sum + d.workedHours, 0) * 100) / 100;

  return {
    sollHours,
    istHours,
    diffHours: Math.round((istHours - sollHours) * 100) / 100,
    sickDays: days.filter((d) => d.entry?.type === "sick").length,
    vacationDays: days.filter((d) => d.entry?.type === "vacation").length,
    days,
  };
}

export async function listTimeEntriesInRange(
  organizationId: string,
  userId: string,
  start: Date,
  end: Date,
) {
  const rows = await prisma.timeEntry.findMany({
    where: {
      organizationId,
      userId,
      date: {
        gte: new Date(`${toTimeDateKey(start)}T12:00:00.000Z`),
        lte: new Date(`${toTimeDateKey(end)}T12:00:00.000Z`),
      },
    },
    include: {
      segments: { orderBy: [{ sortOrder: "asc" }, { startTime: "asc" }] },
    },
    orderBy: { date: "asc" },
  });
  return rows.map(toEntryRow);
}

export async function getWeekTimeSummary(
  organizationId: string,
  userId: string,
  pensumPercent: number,
  weekAnchor: Date = new Date(),
) {
  const start = startOfWeek(weekAnchor, { weekStartsOn: 1 });
  const end = endOfWeek(weekAnchor, { weekStartsOn: 1 });
  const entries = await listTimeEntriesInRange(
    organizationId,
    userId,
    start,
    end,
  );
  return {
    start,
    end,
    ...summarizePeriod(start, end, entries, pensumPercent),
  };
}

export async function getMonthTimeSummary(
  organizationId: string,
  userId: string,
  pensumPercent: number,
  monthAnchor: Date = new Date(),
) {
  const start = startOfMonth(monthAnchor);
  const end = endOfMonth(monthAnchor);
  const entries = await listTimeEntriesInRange(
    organizationId,
    userId,
    start,
    end,
  );
  return {
    start,
    end,
    ...summarizePeriod(start, end, entries, pensumPercent),
  };
}

/** Progress through the current week up to today (Mon–today), for Home teaser. */
export async function getCurrentWeekProgress(
  organizationId: string,
  userId: string,
  pensumPercent: number,
) {
  const today = new Date();
  const weekStart = startOfWeek(today, { weekStartsOn: 1 });
  const through = today < weekStart ? weekStart : today;
  const entries = await listTimeEntriesInRange(
    organizationId,
    userId,
    weekStart,
    through,
  );
  return summarizePeriod(weekStart, through, entries, pensumPercent);
}

export type PastWeekTimeGap = {
  dateKey: string;
  dateLabel: string;
  reason: "missing" | "incomplete";
};

/** Missing / incomplete entries for the previous Mon–Sun week (after it has ended). */
export async function getPastWeekTimeGaps(
  organizationId: string,
  userId: string,
  pensumPercent: number,
  today: Date = new Date(),
): Promise<{
  weekStart: Date;
  weekEnd: Date;
  weekLabel: string;
  weekParam: string;
  gaps: PastWeekTimeGap[];
}> {
  const thisMonday = startOfWeek(today, { weekStartsOn: 1 });
  const lastMonday = addDays(thisMonday, -7);
  const lastSunday = addDays(thisMonday, -1);

  const summary = await getWeekTimeSummary(
    organizationId,
    userId,
    pensumPercent,
    lastMonday,
  );

  const gaps: PastWeekTimeGap[] = [];
  for (const day of summary.days) {
    if (day.baseSollHours <= 0) continue;

    if (!day.entry) {
      gaps.push({
        dateKey: day.dateKey,
        dateLabel: format(day.date, "EEE d.M.", { locale: de }),
        reason: "missing",
      });
      continue;
    }

    if (
      day.entry.type === "work" &&
      (day.entry.segments.length === 0 ||
        day.entry.segments.some((s) => !s.endTime))
    ) {
      gaps.push({
        dateKey: day.dateKey,
        dateLabel: format(day.date, "EEE d.M.", { locale: de }),
        reason: "incomplete",
      });
    }
  }

  return {
    weekStart: lastMonday,
    weekEnd: lastSunday,
    weekLabel: weekLabel(lastMonday, lastSunday),
    weekParam: toTimeDateKey(lastMonday),
    gaps,
  };
}

/** Calendar year start (local) through today — avoids charging Soll for future days. */
export async function getYearToDateTimeSummary(
  organizationId: string,
  userId: string,
  pensumPercent: number,
  today: Date = new Date(),
) {
  const start = new Date(today.getFullYear(), 0, 1, 12, 0, 0, 0);
  const end = today;
  const entries = await listTimeEntriesInRange(
    organizationId,
    userId,
    start,
    end,
  );
  return {
    start,
    end,
    ...summarizePeriod(start, end, entries, pensumPercent),
  };
}

export type TeamMemberHoursRow = {
  userId: string;
  name: string;
  email: string;
  pensumPercent: number;
  role: string;
  archived: boolean;
  week: PeriodSummary;
  month: PeriodSummary;
  year: PeriodSummary;
};

export async function listTeamHoursOverview(
  organizationId: string,
): Promise<TeamMemberHoursRow[]> {
  const today = new Date();
  const yearStart = new Date(today.getFullYear(), 0, 1, 12, 0, 0, 0);
  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);
  const weekStart = startOfWeek(today, { weekStartsOn: 1 });

  const members = await prisma.membership.findMany({
    where: { organizationId },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
    orderBy: [{ archivedAt: "asc" }, { user: { name: "asc" } }],
  });

  const rangeEnd = monthEnd > today ? monthEnd : today;
  const entries = await prisma.timeEntry.findMany({
    where: {
      organizationId,
      date: {
        gte: new Date(`${toTimeDateKey(yearStart)}T12:00:00.000Z`),
        lte: new Date(`${toTimeDateKey(rangeEnd)}T12:00:00.000Z`),
      },
    },
    include: {
      segments: { orderBy: [{ sortOrder: "asc" }, { startTime: "asc" }] },
    },
    orderBy: { date: "asc" },
  });

  const byUser = new Map<string, TimeEntryRow[]>();
  for (const row of entries) {
    const list = byUser.get(row.userId) ?? [];
    list.push(toEntryRow(row));
    byUser.set(row.userId, list);
  }

  return members.map((m) => {
    const all = byUser.get(m.userId) ?? [];
    const inRange = (start: Date, end: Date) =>
      all.filter((e) => {
        const key = toTimeDateKey(e.date);
        return key >= toTimeDateKey(start) && key <= toTimeDateKey(end);
      });

    return {
      userId: m.userId,
      name: m.user.name,
      email: m.user.email,
      pensumPercent: m.pensumPercent,
      role: m.role,
      archived: !!m.archivedAt,
      week: summarizePeriod(
        weekStart,
        today,
        inRange(weekStart, today),
        m.pensumPercent,
      ),
      month: summarizePeriod(
        monthStart,
        monthEnd,
        inRange(monthStart, monthEnd),
        m.pensumPercent,
      ),
      year: summarizePeriod(
        yearStart,
        today,
        inRange(yearStart, today),
        m.pensumPercent,
      ),
    };
  });
}

export function weekLabel(start: Date, end: Date) {
  return `${format(start, "d. MMM", { locale: de })} – ${format(end, "d. MMM yyyy", { locale: de })}`;
}
