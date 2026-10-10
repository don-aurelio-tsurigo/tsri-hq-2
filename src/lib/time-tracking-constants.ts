import { format } from "date-fns";

/** Bezug Vollzeit (Mo–Fr). */
export const FULL_WEEK_HOURS = 40;
export const FULL_DAY_HOURS = 8;

export const TIME_ENTRY_TYPES = [
  "work",
  "sick",
  "vacation",
  "holiday",
] as const;

export type TimeEntryTypeValue = (typeof TIME_ENTRY_TYPES)[number];

export const TIME_ENTRY_TYPE_LABELS: Record<TimeEntryTypeValue, string> = {
  work: "Arbeit",
  sick: "Krank",
  vacation: "Ferien",
  holiday: "Feiertag",
};

export function isTimeEntryType(value: string): value is TimeEntryTypeValue {
  return (TIME_ENTRY_TYPES as readonly string[]).includes(value);
}

export const TIME_SEGMENT_TYPES = ["work", "break"] as const;

export type TimeSegmentKind = (typeof TIME_SEGMENT_TYPES)[number];

export const TIME_SEGMENT_TYPE_LABELS: Record<TimeSegmentKind, string> = {
  work: "Arbeit",
  break: "Pause",
};

export function isTimeSegmentKind(value: string): value is TimeSegmentKind {
  return (TIME_SEGMENT_TYPES as readonly string[]).includes(value);
}

export type TimeSegmentInput = {
  type: TimeSegmentKind;
  startTime: string;
  endTime: string;
};

/** Parse "HH:mm" → minutes from midnight, or null. */
export function parseTimeToMinutes(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function formatMinutesAsTime(totalMinutes: number): string {
  const mins = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Minutes between start and end; supports overnight. */
export function segmentDurationMinutes(
  startTime: string | null | undefined,
  endTime: string | null | undefined,
): number {
  const start = parseTimeToMinutes(startTime);
  const end = parseTimeToMinutes(endTime);
  if (start === null || end === null) return 0;
  let duration = end - start;
  if (duration < 0) duration += 24 * 60;
  return duration;
}

/** Half-open [start, end) ranges in minutes-from-midnight (end may be +24h). */
function segmentRangesOfType(
  segments: readonly TimeSegmentInput[],
  kind: TimeSegmentKind,
): { start: number; end: number }[] {
  const ranges: { start: number; end: number }[] = [];
  for (const s of segments) {
    if (s.type !== kind) continue;
    const start = parseTimeToMinutes(s.startTime);
    const endRaw = parseTimeToMinutes(s.endTime);
    if (start === null || endRaw === null) continue;
    const end = endRaw < start ? endRaw + 24 * 60 : endRaw;
    ranges.push({ start, end });
  }
  return ranges;
}

/** Sorted, disjoint union of the given ranges. */
function mergeRanges(
  ranges: readonly { start: number; end: number }[],
): { start: number; end: number }[] {
  const sorted = ranges.slice().sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [];
  for (const r of sorted) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end) {
      last.end = Math.max(last.end, r.end);
    } else {
      merged.push({ ...r });
    }
  }
  return merged;
}

/** Minuten Arbeit, abzüglich nur jener Pausenanteile, die in einen Arbeitsblock fallen. */
function workedMinutes(segments: readonly TimeSegmentInput[]): number {
  const work = mergeRanges(segmentRangesOfType(segments, "work"));
  const breaks = mergeRanges(segmentRangesOfType(segments, "break"));
  let total = 0;
  for (const w of work) {
    let minutes = w.end - w.start;
    for (const b of breaks) {
      minutes -= Math.max(0, Math.min(w.end, b.end) - Math.max(w.start, b.start));
    }
    total += minutes;
  }
  return total;
}

function minutesToHours(minutes: number): number {
  return Math.round((minutes / 60) * 100) / 100;
}

/**
 * Netto-Arbeitszeit in Stunden (2 Dezimalen).
 * Pausen werden nur abgezogen, soweit sie innerhalb eines Arbeitsblocks liegen —
 * eine Lücke zwischen zwei Arbeitsblöcken zählt bereits als Pause und wird nicht
 * doppelt abgezogen, auch wenn sie zusätzlich als Pause erfasst ist.
 * Leere Liste / nur Pause → 0.
 */
export function computeWorkedHours(
  segments: readonly TimeSegmentInput[],
): number {
  return minutesToHours(workedMinutes(segments));
}

/**
 * Effektive Pause in Stunden (2 Dezimalen): Zeit zwischen erstem Arbeitsbeginn und
 * letztem Arbeitsende, die nicht gearbeitet wurde (Lücken + Pausen in Blöcken).
 */
export function computeBreakHours(
  segments: readonly TimeSegmentInput[],
): number {
  const work = mergeRanges(segmentRangesOfType(segments, "work"));
  if (work.length === 0) return 0;
  const span = work[work.length - 1]!.end - work[0]!.start;
  return minutesToHours(Math.max(0, span - workedMinutes(segments)));
}

function rangesOverlap(
  ranges: readonly { start: number; end: number }[],
): boolean {
  for (let i = 0; i < ranges.length; i++) {
    for (let j = i + 1; j < ranges.length; j++) {
      const a = ranges[i]!;
      const b = ranges[j]!;
      if (a.start < b.end && b.start < a.end) return true;
    }
  }
  return false;
}

/**
 * True if two segments of the same type overlap.
 * Work↔break overlaps are allowed (pause inside a work block).
 */
export function segmentsOverlap(
  segments: readonly TimeSegmentInput[],
): boolean {
  return (
    rangesOverlap(segmentRangesOfType(segments, "work")) ||
    rangesOverlap(segmentRangesOfType(segments, "break"))
  );
}

export function dailyTargetHours(pensumPercent: number): number {
  const pensum = Math.min(100, Math.max(1, pensumPercent)) / 100;
  return Math.round(FULL_DAY_HOURS * pensum * 100) / 100;
}

export function formatHours(hours: number): string {
  const rounded = Math.round(hours * 100) / 100;
  return Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toFixed(2).replace(/\.?0+$/, "");
}

export const APP_TIME_ZONE = "Europe/Zurich";

/**
 * Heutiges Kalenderdatum in Zürich als lokales Date (12:00), unabhängig von der
 * Server-Zeitzone (Render läuft in UTC — sonst wäre "heute" nachts um 0–2 Uhr falsch).
 */
export function todayInZurich(now: Date = new Date()): Date {
  const key = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y!, m! - 1, d!, 12, 0, 0, 0);
}

/** Calendar day key in local timezone (matches week UI / date-fns ranges). */
export function toTimeDateKey(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

export function formatSegmentsSummary(
  segments: readonly TimeSegmentInput[],
): string | null {
  if (segments.length === 0) return null;
  return segments
    .map((s) => {
      const range = `${s.startTime}–${s.endTime}`;
      return s.type === "break" ? `Pause ${range}` : range;
    })
    .join(", ");
}
