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

export type TimeSegmentInput = {
  startTime: string;
  endTime: string | null;
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

/** Minutes between start and end; supports overnight. Open segments → 0. */
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

/**
 * Sum worked hours across segments. Open segments (endTime null) count as 0.
 * Absence entries should pass an empty list → 0.
 */
export function computeWorkedHours(
  segments: readonly TimeSegmentInput[],
): number {
  const minutes = segments.reduce(
    (sum, s) => sum + segmentDurationMinutes(s.startTime, s.endTime),
    0,
  );
  return Math.round((minutes / 60) * 100) / 100;
}

/** Half-open [start, end) ranges in minutes-from-midnight (end may be +24h). */
function segmentRanges(
  segments: readonly TimeSegmentInput[],
): { start: number; end: number; index: number }[] {
  const ranges: { start: number; end: number; index: number }[] = [];
  segments.forEach((s, index) => {
    const start = parseTimeToMinutes(s.startTime);
    if (start === null) return;
    const endRaw = parseTimeToMinutes(s.endTime);
    // Open: treat as a point for overlap with closed ranges that contain start
    const end = endRaw === null ? start : endRaw < start ? endRaw + 24 * 60 : endRaw;
    ranges.push({ start, end, index });
  });
  return ranges;
}

/** True if any two segments overlap (open segments conflict if start falls inside another). */
export function segmentsOverlap(
  segments: readonly TimeSegmentInput[],
): boolean {
  const ranges = segmentRanges(segments);
  for (let i = 0; i < ranges.length; i++) {
    for (let j = i + 1; j < ranges.length; j++) {
      const a = ranges[i]!;
      const b = ranges[j]!;
      // Overlap if intervals intersect with positive length, or either open
      // point lies strictly inside the other closed interval.
      const aOpen = a.end === a.start;
      const bOpen = b.end === b.start;
      if (aOpen && bOpen) {
        if (a.start === b.start) return true;
        continue;
      }
      if (aOpen) {
        if (a.start > b.start && a.start < b.end) return true;
        continue;
      }
      if (bOpen) {
        if (b.start > a.start && b.start < a.end) return true;
        continue;
      }
      if (a.start < b.end && b.start < a.end) return true;
    }
  }
  return false;
}

/**
 * Display-only: gap minutes between consecutive sorted closed segments
 * (same calendar day ordering by start). Overnight segments included.
 */
export function breakMinutesFromGaps(
  segments: readonly TimeSegmentInput[],
): number {
  const closed = segments
    .map((s) => {
      const start = parseTimeToMinutes(s.startTime);
      const end = parseTimeToMinutes(s.endTime);
      if (start === null || end === null) return null;
      const endAdj = end < start ? end + 24 * 60 : end;
      return { start, end: endAdj };
    })
    .filter((x): x is { start: number; end: number } => x !== null)
    .sort((a, b) => a.start - b.start);

  let gaps = 0;
  for (let i = 1; i < closed.length; i++) {
    const prev = closed[i - 1]!;
    const cur = closed[i]!;
    const gap = cur.start - prev.end;
    if (gap > 0) gaps += gap;
  }
  return gaps;
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

/** Calendar day key in local timezone (matches week UI / date-fns ranges). */
export function toTimeDateKey(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

export function formatSegmentsSummary(
  segments: readonly TimeSegmentInput[],
): string | null {
  if (segments.length === 0) return null;
  const parts = segments.map((s) =>
    s.endTime ? `${s.startTime}–${s.endTime}` : `seit ${s.startTime}`,
  );
  return parts.join(", ");
}
