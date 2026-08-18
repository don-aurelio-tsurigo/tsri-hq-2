import { addDays } from "date-fns";

/** Client-safe ad campaign row (no Prisma / pg imports). */
export type AdCampaignRow = {
  id: string;
  creativeId: string;
  name: string;
  startDate: string;
  endDate: string;
  status: "ACTIVE" | "PAUSED";
  type: "IMAGE" | "VIDEO";
  mediaUrl: string;
  targetUrl: string;
  impressionLimit: number | null;
  impressions: number;
  clicks: number;
};

const ADS_TZ = "Europe/Zurich";

/** Calendar day YYYY-MM-DD in Europe/Zurich. */
export function zurichDateKey(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ADS_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Offset such that `utcInstant + offset ≈ Zurich wall-clock as UTC ms`. */
function zurichOffsetMs(utcInstant: Date): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: ADS_TZ,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(utcInstant)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - utcInstant.getTime();
}

/**
 * Interpret `YYYY-MM-DD` as a calendar day in Europe/Zurich
 * (not the server's local timezone — Render runs UTC).
 */
export function parseZurichDayStart(isoDate: string): Date {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return new Date(Number.NaN);
  let utc = Date.UTC(y, m - 1, d, 0, 0, 0, 0);
  let off = zurichOffsetMs(new Date(utc));
  utc = Date.UTC(y, m - 1, d, 0, 0, 0, 0) - off;
  off = zurichOffsetMs(new Date(utc));
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0) - off);
}

/** Last millisecond of the Zurich calendar day. */
export function parseZurichDayEnd(isoDate: string): Date {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return new Date(Number.NaN);
  const nextKey = zurichDateKey(new Date(Date.UTC(y, m - 1, d + 1, 12)));
  return new Date(parseZurichDayStart(nextKey).getTime() - 1);
}

export function defaultAdDateRange() {
  const startDate = zurichDateKey();
  const [y, m, d] = startDate.split("-").map(Number);
  const endDate = zurichDateKey(addDays(new Date(Date.UTC(y!, m! - 1, d!, 12)), 30));
  return { startDate, endDate };
}
