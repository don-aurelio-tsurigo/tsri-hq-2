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

function hoursFromSegmentsOfType(
  segments: readonly TimeSegmentInput[],
  kind: TimeSegmentKind,
): number {
  const minutes = segments
    .filter((s) => s.type === kind)
    .reduce(
      (sum, s) => sum + segmentDurationMinutes(s.startTime, s.endTime),
      0,
    );
  return Math.round((minutes / 60) * 100) / 100;
}

/**
 * Summe der Dauer aller Segmente vom Typ work, in Stunden (2 Dezimalen).
 * Pause-Segmente zählen nicht. Leere Liste → 0.
 */
export function computeWorkedHours(
  segments: readonly TimeSegmentInput[],
): number {
  return hoursFromSegmentsOfType(segments, "work");
}

/** Summe der Pause-Segmente in Stunden (2 Dezimalen). */
export function computeBreakHours(
  segments: readonly TimeSegmentInput[],
): number {
  return hoursFromSegmentsOfType(segments, "break");
}

/** Half-open [start, end) ranges in minutes-from-midnight (end may be +24h). */
function segmentRanges(
  segments: readonly TimeSegmentInput[],
): { start: number; end: number }[] {
  const ranges: { start: number; end: number }[] = [];
  for (const s of segments) {
    const start = parseTimeToMinutes(s.startTime);
    const endRaw = parseTimeToMinutes(s.endTime);
    if (start === null || endRaw === null) continue;
    const end = endRaw < start ? endRaw + 24 * 60 : endRaw;
    ranges.push({ start, end });
  }
  return ranges;
}

/** True if any two closed segments overlap (work and break alike). */
export function segmentsOverlap(
  segments: readonly TimeSegmentInput[],
): boolean {
  const ranges = segmentRanges(segments);
  for (let i = 0; i < ranges.length; i++) {
    for (let j = i + 1; j < ranges.length; j++) {
      const a = ranges[i]!;
      const b = ranges[j]!;
      if (a.start < b.end && b.start < a.end) return true;
    }
  }
  return false;
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
  return segments
    .map((s) => {
      const range = `${s.startTime}–${s.endTime}`;
      return s.type === "break" ? `Pause ${range}` : range;
    })
    .join(", ");
}
