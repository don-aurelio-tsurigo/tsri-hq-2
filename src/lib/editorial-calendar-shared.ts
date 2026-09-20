import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  endOfYear,
  format,
  getDaysInMonth,
  getISODay,
  isValid,
  setDate,
  setMonth,
  startOfDay,
  startOfMonth,
  startOfYear,
} from "date-fns";
import { de } from "date-fns/locale";

/** Client-safe calendar helpers — no Prisma / DB imports. */

export type CalendarFrequency =
  | "once"
  | "weekly"
  | "monthly"
  | "yearly"
  | "every_n_years";

export type CalendarDateMode = "fixed" | "rule" | "pending";

export const CALENDAR_FREQUENCIES = [
  "once",
  "weekly",
  "monthly",
  "yearly",
  "every_n_years",
] as const satisfies readonly CalendarFrequency[];

export const CALENDAR_DATE_MODES = [
  "fixed",
  "rule",
  "pending",
] as const satisfies readonly CalendarDateMode[];

export const FREQUENCY_LABELS: Record<CalendarFrequency, string> = {
  once: "Einmalig",
  weekly: "Wöchentlich",
  monthly: "Monatlich",
  yearly: "Jährlich",
  every_n_years: "Alle N Jahre",
};

export const DATE_MODE_LABELS: Record<CalendarDateMode, string> = {
  fixed: "Fixes Datum",
  rule: "Nach Regel",
  pending: "Datum noch offen",
};

export const WEEKDAY_OPTIONS = [
  { value: 1, label: "Montag" },
  { value: 2, label: "Dienstag" },
  { value: 3, label: "Mittwoch" },
  { value: 4, label: "Donnerstag" },
  { value: 5, label: "Freitag" },
  { value: 6, label: "Samstag" },
  { value: 7, label: "Sonntag" },
] as const;

export const NTH_OPTIONS = [
  { value: 1, label: "1." },
  { value: 2, label: "2." },
  { value: 3, label: "3." },
  { value: 4, label: "4." },
  { value: -1, label: "letzter" },
] as const;

export type CalendarEventFields = {
  frequency: CalendarFrequency;
  dateMode: CalendarDateMode;
  date: Date | null;
  day: number | null;
  month: number | null;
  ruleWeekday: number | null;
  ruleNth: number | null;
  ruleMonth: number | null;
  intervalYears: number | null;
  anchorYear: number | null;
};

export type ResolvedOccurrence = {
  eventId: string;
  dateKey: string;
  date: Date;
  title: string;
  note: string | null;
  frequency: CalendarFrequency;
  dateMode: CalendarDateMode;
  category: { id: string; name: string; color: string } | null;
};

export type PendingEvent = {
  id: string;
  title: string;
  note: string | null;
  frequency: CalendarFrequency;
  intervalYears: number | null;
  category: { id: string; name: string; color: string } | null;
};

export type CalendarCategoryOption = {
  id: string;
  name: string;
  color: string;
  active: boolean;
  sortOrder: number;
};

export type CalendarEventDetail = {
  id: string;
  title: string;
  note: string | null;
  frequency: CalendarFrequency;
  dateMode: CalendarDateMode;
  dateKey: string | null;
  day: number | null;
  month: number | null;
  ruleWeekday: number | null;
  ruleNth: number | null;
  ruleMonth: number | null;
  intervalYears: number | null;
  anchorYear: number | null;
  categoryId: string | null;
  occurrenceDateKey: string | null;
  occurrenceNote: string | null;
};

export function dateKey(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

/** Prisma `@db.Date` values arrive as UTC midnight of the calendar day. */
export function dateKeyFromDb(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function parseDateKey(key: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  // Noon UTC keeps the calendar day stable across CH timezones
  const d = new Date(`${key}T12:00:00.000Z`);
  return isValid(d) ? d : null;
}

export function parseYearParam(value: string | undefined): number {
  const now = new Date().getFullYear();
  if (!value) return now;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n < 2000 || n > 2100) return now;
  return n;
}

/** ISO weekday 1=Mon … 7=Sun; nth 1–4 or -1 = last */
export function nthWeekdayOfMonth(
  year: number,
  month: number,
  weekday: number,
  nth: number,
): Date | null {
  if (month < 1 || month > 12) return null;
  if (weekday < 1 || weekday > 7) return null;
  if (nth !== -1 && (nth < 1 || nth > 4)) return null;

  const monthIndex = month - 1;

  if (nth === -1) {
    let cursor = endOfMonth(new Date(year, monthIndex, 1));
    for (let i = 0; i < 7; i++) {
      if (getISODay(cursor) === weekday) return startOfDay(cursor);
      cursor = addDays(cursor, -1);
    }
    return null;
  }

  let cursor = startOfMonth(new Date(year, monthIndex, 1));
  while (getISODay(cursor) !== weekday) {
    cursor = addDays(cursor, 1);
  }
  cursor = addDays(cursor, (nth - 1) * 7);
  if (cursor.getMonth() !== monthIndex) return null;
  return startOfDay(cursor);
}

function clampDayInMonth(year: number, month: number, day: number): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const max = getDaysInMonth(new Date(year, month - 1, 1));
  const clamped = Math.min(day, max);
  return startOfDay(new Date(year, month - 1, clamped));
}

export function yearInSeries(
  year: number,
  anchorYear: number | null,
  intervalYears: number | null,
): boolean {
  if (anchorYear == null || intervalYears == null || intervalYears < 1) {
    return false;
  }
  if (year < anchorYear) return false;
  return (year - anchorYear) % intervalYears === 0;
}

function occurrenceFromFields(
  fields: CalendarEventFields,
  year: number,
): Date[] {
  const { frequency, dateMode } = fields;

  if (dateMode === "pending") return [];

  if (frequency === "once") {
    if (!fields.date) return [];
    const key = dateKeyFromDb(fields.date);
    const y = Number.parseInt(key.slice(0, 4), 10);
    if (y !== year) return [];
    const [, m, d] = key.split("-").map(Number);
    return [startOfDay(new Date(year, m - 1, d))];
  }

  if (frequency === "weekly") {
    if (fields.ruleWeekday == null) return [];
    const days = eachDayOfInterval({
      start: startOfYear(new Date(year, 0, 1)),
      end: endOfYear(new Date(year, 0, 1)),
    });
    return days.filter((d) => getISODay(d) === fields.ruleWeekday);
  }

  if (frequency === "monthly") {
    const dates: Date[] = [];
    for (let month = 1; month <= 12; month++) {
      if (dateMode === "fixed") {
        if (fields.day == null) continue;
        const d = clampDayInMonth(year, month, fields.day);
        if (d) dates.push(d);
      } else if (dateMode === "rule") {
        if (fields.ruleWeekday == null || fields.ruleNth == null) continue;
        const d = nthWeekdayOfMonth(
          year,
          month,
          fields.ruleWeekday,
          fields.ruleNth,
        );
        if (d) dates.push(d);
      }
    }
    return dates;
  }

  if (frequency === "every_n_years") {
    if (!yearInSeries(year, fields.anchorYear, fields.intervalYears)) {
      return [];
    }
  }

  // yearly or every_n_years (in series)
  if (dateMode === "fixed") {
    if (fields.month == null || fields.day == null) return [];
    const d = clampDayInMonth(year, fields.month, fields.day);
    return d ? [d] : [];
  }

  if (dateMode === "rule") {
    const ruleMonth = fields.ruleMonth ?? fields.month;
    if (
      ruleMonth == null ||
      fields.ruleWeekday == null ||
      fields.ruleNth == null
    ) {
      return [];
    }
    const d = nthWeekdayOfMonth(
      year,
      ruleMonth,
      fields.ruleWeekday,
      fields.ruleNth,
    );
    return d ? [d] : [];
  }

  return [];
}

export function listOccurrencesInYear(
  fields: CalendarEventFields,
  year: number,
  pendingDate: Date | null = null,
): Date[] {
  if (fields.dateMode === "pending") {
    if (!pendingDate) return [];
    const key = dateKeyFromDb(pendingDate);
    const y = Number.parseInt(key.slice(0, 4), 10);
    if (y !== year) return [];
    const [, m, d] = key.split("-").map(Number);
    return [startOfDay(new Date(year, m - 1, d))];
  }
  return occurrenceFromFields(fields, year);
}

export function allowedDateModes(
  frequency: CalendarFrequency,
): CalendarDateMode[] {
  if (frequency === "once") return ["fixed"];
  if (frequency === "weekly") return ["fixed"];
  if (frequency === "monthly") return ["fixed", "rule"];
  return ["fixed", "rule", "pending"];
}

export function validateScheduleFields(
  fields: CalendarEventFields,
): string | null {
  const modes = allowedDateModes(fields.frequency);
  if (!modes.includes(fields.dateMode)) {
    return "Diese Kombination aus Wiederholung und Datumsmodus ist nicht erlaubt.";
  }

  if (fields.frequency === "once") {
    if (!fields.date) return "Datum fehlt.";
    return null;
  }

  if (fields.frequency === "weekly") {
    if (
      fields.ruleWeekday == null ||
      fields.ruleWeekday < 1 ||
      fields.ruleWeekday > 7
    ) {
      return "Wochentag wählen.";
    }
    return null;
  }

  if (fields.frequency === "every_n_years") {
    if (fields.intervalYears == null || fields.intervalYears < 2) {
      return "Intervall (mind. 2 Jahre) angeben.";
    }
    if (fields.anchorYear == null || fields.anchorYear < 2000) {
      return "Bezugsjahr angeben.";
    }
  }

  if (fields.dateMode === "pending") return null;

  if (fields.frequency === "monthly" && fields.dateMode === "fixed") {
    if (fields.day == null || fields.day < 1 || fields.day > 31) {
      return "Tag im Monat (1–31) angeben.";
    }
    return null;
  }

  if (fields.frequency === "monthly" && fields.dateMode === "rule") {
    if (fields.ruleWeekday == null || fields.ruleNth == null) {
      return "Wochentag und Position (1./letzter …) wählen.";
    }
    return null;
  }

  if (
    (fields.frequency === "yearly" || fields.frequency === "every_n_years") &&
    fields.dateMode === "fixed"
  ) {
    if (fields.month == null || fields.month < 1 || fields.month > 12) {
      return "Monat wählen.";
    }
    if (fields.day == null || fields.day < 1 || fields.day > 31) {
      return "Tag wählen.";
    }
    return null;
  }

  if (
    (fields.frequency === "yearly" || fields.frequency === "every_n_years") &&
    fields.dateMode === "rule"
  ) {
    const ruleMonth = fields.ruleMonth ?? fields.month;
    if (ruleMonth == null || ruleMonth < 1 || ruleMonth > 12) {
      return "Monat wählen.";
    }
    if (fields.ruleWeekday == null || fields.ruleNth == null) {
      return "Wochentag und Position wählen.";
    }
    return null;
  }

  return null;
}

export function monthLabelsForYear(year: number): {
  month: number;
  label: string;
  monthKey: string;
}[] {
  return Array.from({ length: 12 }, (_, i) => {
    const d = setDate(setMonth(new Date(year, 0, 1), i), 1);
    return {
      month: i + 1,
      label: format(d, "MMMM", { locale: de }),
      monthKey: format(d, "yyyy-MM"),
    };
  });
}

export function daysInMonthGrid(
  year: number,
  month: number,
): {
  dateKey: string | null;
  day: number | null;
  inMonth: boolean;
}[] {
  const start = startOfMonth(new Date(year, month - 1, 1));
  const end = endOfMonth(start);
  const startPad = getISODay(start) - 1; // Mon=0
  const cells: {
    dateKey: string | null;
    day: number | null;
    inMonth: boolean;
  }[] = [];

  for (let i = 0; i < startPad; i++) {
    cells.push({ dateKey: null, day: null, inMonth: false });
  }

  let cursor = start;
  while (cursor <= end) {
    cells.push({
      dateKey: format(cursor, "yyyy-MM-dd"),
      day: cursor.getDate(),
      inMonth: true,
    });
    cursor = addDays(cursor, 1);
  }

  while (cells.length % 7 !== 0) {
    cells.push({ dateKey: null, day: null, inMonth: false });
  }

  return cells;
}

export type CalendarViewMode = "month" | "week" | "year";

export function parseViewParam(value: string | undefined): CalendarViewMode {
  if (value === "week" || value === "year" || value === "month") return value;
  return "month";
}

/** `yyyy-MM` → { year, month 1–12 } */
export function parseMonthKey(value: string | undefined): {
  year: number;
  month: number;
} | null {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) return null;
  const year = Number.parseInt(value.slice(0, 4), 10);
  const month = Number.parseInt(value.slice(5, 7), 10);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

export function monthKeyFromParts(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** Monday of the ISO week containing `date` (local). */
export function startOfIsoWeek(date: Date): Date {
  const d = startOfDay(date);
  return addDays(d, -(getISODay(d) - 1));
}

export function daysInWeek(weekStart: Date): {
  dateKey: string;
  date: Date;
  day: number;
  weekdayLabel: string;
}[] {
  const start = startOfIsoWeek(weekStart);
  return Array.from({ length: 7 }, (_, i) => {
    const d = addDays(start, i);
    return {
      dateKey: format(d, "yyyy-MM-dd"),
      date: d,
      day: d.getDate(),
      weekdayLabel: format(d, "EEEE", { locale: de }),
    };
  });
}

export function formatMonthTitle(year: number, month: number): string {
  return format(new Date(year, month - 1, 1), "MMMM yyyy", { locale: de });
}

export function formatWeekTitle(weekStart: Date): string {
  const start = startOfIsoWeek(weekStart);
  const end = addDays(start, 6);
  return `${format(start, "d. MMM", { locale: de })} – ${format(end, "d. MMM yyyy", { locale: de })}`;
}
