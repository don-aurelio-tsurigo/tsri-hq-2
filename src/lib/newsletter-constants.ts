export const NEWSLETTER_FREQUENCIES = ["daily", "weekly"] as const;
export type NewsletterFrequencyValue = (typeof NEWSLETTER_FREQUENCIES)[number];

export const NEWSLETTER_FREQUENCY_LABELS: Record<
  NewsletterFrequencyValue,
  string
> = {
  daily: "Täglich",
  weekly: "Wöchentlich",
};

/** ISO weekdays: 1=Monday … 7=Sunday */
export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  1: "Mo",
  2: "Di",
  3: "Mi",
  4: "Do",
  5: "Fr",
  6: "Sa",
  7: "So",
};

export const WEEKDAY_FULL_LABELS: Record<Weekday, string> = {
  1: "Montag",
  2: "Dienstag",
  3: "Mittwoch",
  4: "Donnerstag",
  5: "Freitag",
  6: "Samstag",
  7: "Sonntag",
};

export const DEFAULT_WEEKDAYS_BY_FREQUENCY: Record<
  NewsletterFrequencyValue,
  Weekday[]
> = {
  daily: [1, 2, 3, 4, 5],
  weekly: [2],
};

export const NEWSLETTER_CAMPAIGN_STATUSES = [
  "planned",
  "published",
  "skipped",
] as const;
export type NewsletterCampaignStatusValue =
  (typeof NEWSLETTER_CAMPAIGN_STATUSES)[number];

export const NEWSLETTER_CAMPAIGN_STATUS_LABELS: Record<
  NewsletterCampaignStatusValue,
  string
> = {
  planned: "Geplant",
  published: "Erschienen",
  skipped: "Nicht erschienen",
};

export const GENERATE_HORIZON_WEEKS = [2, 4, 8, 12, 26] as const;
export type GenerateHorizonWeeks = (typeof GENERATE_HORIZON_WEEKS)[number];

export const GENERATE_HORIZON_LABELS: Record<GenerateHorizonWeeks, string> = {
  2: "2 Wochen",
  4: "4 Wochen",
  8: "8 Wochen",
  12: "3 Monate",
  26: "6 Monate",
};

export function isNewsletterFrequency(
  value: string,
): value is NewsletterFrequencyValue {
  return (NEWSLETTER_FREQUENCIES as readonly string[]).includes(value);
}

/** Infer stored frequency from selected weekdays (UI no longer asks for it). */
export function frequencyFromWeekdays(
  weekdays: readonly number[],
): NewsletterFrequencyValue {
  return weekdays.length >= 7 ? "daily" : "weekly";
}

export function isNewsletterCampaignStatus(
  value: string,
): value is NewsletterCampaignStatusValue {
  return (NEWSLETTER_CAMPAIGN_STATUSES as readonly string[]).includes(value);
}

export function isWeekday(value: number): value is Weekday {
  return (WEEKDAYS as readonly number[]).includes(value);
}

export function parseWeekdays(values: string[]): Weekday[] {
  const unique = new Set<Weekday>();
  for (const raw of values) {
    const n = Number(raw);
    if (isWeekday(n)) unique.add(n);
  }
  return [...unique].sort((a, b) => a - b);
}

/** ISO weekday from yyyy-MM-dd (UTC calendar date). */
export function isoWeekdayFromDateKey(dateKey: string): Weekday | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  const js = date.getUTCDay();
  return (js === 0 ? 7 : js) as Weekday;
}

export function formatWeekdays(weekdays: number[]): string {
  const days = weekdays.filter(isWeekday).sort((a, b) => a - b);
  if (days.length === 0) return "Keine Tage";

  const parts: string[] = [];
  let start = days[0]!;
  let prev = days[0]!;
  for (let i = 1; i <= days.length; i++) {
    const cur = days[i];
    if (cur === prev + 1) {
      prev = cur;
      continue;
    }
    parts.push(
      start === prev
        ? WEEKDAY_LABELS[start]
        : `${WEEKDAY_LABELS[start]}–${WEEKDAY_LABELS[prev]}`,
    );
    if (cur !== undefined) {
      start = cur;
      prev = cur;
    }
  }
  return parts.join(", ");
}

export function todayDateKey(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDaysToDateKey(dateKey: string, days: number): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d! + days));
  return date.toISOString().slice(0, 10);
}

export function dateKeysInCalendarMonth(year: number, monthIndex0: number): string[] {
  const keys: string[] = [];
  const start = new Date(Date.UTC(year, monthIndex0, 1));
  const end = new Date(Date.UTC(year, monthIndex0 + 1, 0));
  for (
    let d = start.getUTCDate();
    d <= end.getUTCDate();
    d++
  ) {
    const m = String(monthIndex0 + 1).padStart(2, "0");
    const day = String(d).padStart(2, "0");
    keys.push(`${year}-${m}-${day}`);
  }
  return keys;
}

/** Date keys in a calendar month that match ISO weekdays. */
export function scheduledDateKeysInMonth(
  weekdays: number[],
  year: number,
  monthIndex0: number,
): string[] {
  const allowed = new Set(weekdays.filter(isWeekday));
  if (allowed.size === 0) return [];
  return dateKeysInCalendarMonth(year, monthIndex0).filter((key) => {
    const wd = isoWeekdayFromDateKey(key);
    return wd !== null && allowed.has(wd);
  });
}

/** Inclusive date keys matching ISO weekdays from `fromKey` for `weeksAhead` weeks. */
export function scheduledDateKeysForWeeks(
  weekdays: number[],
  weeksAhead: number,
  fromKey = todayDateKey(),
): string[] {
  const allowed = new Set(weekdays.filter(isWeekday));
  if (allowed.size === 0 || weeksAhead < 1) return [];

  const endKey = addDaysToDateKey(fromKey, weeksAhead * 7);
  if (!endKey) return [];

  const keys: string[] = [];
  let cursor: string | null = fromKey;
  while (cursor && cursor <= endKey) {
    const weekday = isoWeekdayFromDateKey(cursor);
    if (weekday && allowed.has(weekday)) keys.push(cursor);
    cursor = addDaysToDateKey(cursor, 1);
  }
  return keys;
}

/** Next (or same-day) matching weekday on/after `fromKey`. */
export function nextScheduledDateKey(
  weekdays: number[],
  fromKey = todayDateKey(),
): string | null {
  return scheduledDateKeysForWeeks(weekdays, 2, fromKey)[0] ?? null;
}
