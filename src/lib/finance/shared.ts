/** Client-safe helpers for the finance budget overview (no Prisma imports). */

export type FinanceKind = "income" | "expense";

export const MONTH_LABELS = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
] as const;

export const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mär",
  "Apr",
  "Mai",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Okt",
  "Nov",
  "Dez",
] as const;

/** "2026-03" */
export type MonthKey = string;

export function monthKey(year: number, monthIndex: number): MonthKey {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

export function monthKeyFromDate(date: Date): MonthKey {
  return monthKey(date.getUTCFullYear(), date.getUTCMonth());
}

/** DATE columns come back as UTC midnight — keep everything in UTC. */
export function monthKeyToDate(key: MonthKey): Date {
  const [y, m] = parseMonthKey(key);
  return new Date(Date.UTC(y, m, 1));
}

export function parseMonthKey(key: MonthKey): [year: number, monthIndex: number] {
  const match = /^(\d{4})-(\d{2})$/.exec(key);
  if (!match) throw new Error(`Ungültiger Monat: ${key}`);
  const monthIndex = Number(match[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) throw new Error(`Ungültiger Monat: ${key}`);
  return [Number(match[1]), monthIndex];
}

export function isMonthKey(value: string): boolean {
  try {
    parseMonthKey(value);
    return true;
  } catch {
    return false;
  }
}

export function monthsOfYear(year: number): MonthKey[] {
  return MONTH_LABELS.map((_, i) => monthKey(year, i));
}

export function monthLabel(key: MonthKey): string {
  const [y, m] = parseMonthKey(key);
  return `${MONTH_LABELS[m]} ${y}`;
}

const chfWhole = new Intl.NumberFormat("de-CH", {
  maximumFractionDigits: 0,
});
const chfExact = new Intl.NumberFormat("de-CH", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Compact table display: 12'500 (no decimals). */
export function formatChf(n: number): string {
  return chfWhole.format(Math.round(n));
}

export function formatChfExact(n: number): string {
  return `${chfExact.format(n)} CHF`;
}

/**
 * Parse user input like "12'500", "-5 000", "1234,50", "12.5k".
 * Returns null for empty input, NaN for garbage.
 */
export function parseAmountInput(raw: string): number | null {
  let s = raw.trim().replace(/[’'\s]/g, "").replace(/CHF/i, "");
  if (s === "") return null;
  let factor = 1;
  if (/k$/i.test(s)) {
    factor = 1000;
    s = s.slice(0, -1);
  }
  s = s.replace(",", ".");
  if (!/^[-+]?\d*\.?\d+$/.test(s)) return Number.NaN;
  return Math.round(Number(s) * factor * 100) / 100;
}

export type CellValues = { budget: number; forecast: number; actual: number };

export const EMPTY_CELL: CellValues = { budget: 0, forecast: 0, actual: 0 };

export type YearTotals = CellValues & {
  /** Abgeschlossene Monate mit Effektiv, offene mit Forecast */
  expected: number;
};

export function sumCells(
  cellsByMonth: Record<MonthKey, CellValues | undefined>,
  months: MonthKey[],
  closedMonths: ReadonlySet<MonthKey>,
): YearTotals {
  const totals: YearTotals = { budget: 0, forecast: 0, actual: 0, expected: 0 };
  for (const m of months) {
    const c = cellsByMonth[m] ?? EMPTY_CELL;
    totals.budget += c.budget;
    totals.forecast += c.forecast;
    totals.actual += c.actual;
    totals.expected += closedMonths.has(m) ? c.actual : c.forecast;
  }
  return totals;
}

/** Add several categories' month cells together (for subtotals). */
export function addCellMaps(
  maps: Record<MonthKey, CellValues | undefined>[],
  months: MonthKey[],
): Record<MonthKey, CellValues> {
  const out: Record<MonthKey, CellValues> = {};
  for (const m of months) {
    const acc = { budget: 0, forecast: 0, actual: 0 };
    for (const map of maps) {
      const c = map[m];
      if (!c) continue;
      acc.budget += c.budget;
      acc.forecast += c.forecast;
      acc.actual += c.actual;
    }
    out[m] = acc;
  }
  return out;
}

export function addMonths(key: MonthKey, count: number): MonthKey {
  const [y, m] = parseMonthKey(key);
  const total = y * 12 + m + count;
  return monthKey(Math.floor(total / 12), ((total % 12) + 12) % 12);
}

export function roundCents(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Lenient amount parsing for webhook payloads: numbers, "12'000.50",
 * "1,200.00" (US thousands), "1200,50" (decimal comma), "CHF 300".
 */
export function parseLooseAmount(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? roundCents(value) : null;
  if (typeof value !== "string") return null;
  let s = value.trim().replace(/[’'\s]/g, "").replace(/^(CHF|EUR|Fr\.?)/i, "").replace(/(CHF|EUR)$/i, "");
  if (s.includes(",") && s.includes(".")) s = s.replace(/,/g, "");
  const parsed = parseAmountInput(s);
  return parsed === null || Number.isNaN(parsed) ? null : parsed;
}

/** "2027-03", "2027-03-15" or "15.03.2027" → MonthKey */
export function parseLooseMonth(value: unknown): MonthKey | null {
  if (typeof value !== "string") return null;
  const s = value.trim();
  let m = /^(\d{4})-(\d{1,2})(?:-\d{1,2})?/.exec(s);
  if (m) return validMonth(Number(m[1]), Number(m[2]));
  m = /^\d{1,2}\.(\d{1,2})\.(\d{4})$/.exec(s);
  if (m) return validMonth(Number(m[2]), Number(m[1]));
  return null;
}

function validMonth(year: number, month: number): MonthKey | null {
  if (year < 2000 || year > 2100 || month < 1 || month > 12) return null;
  return monthKey(year, month - 1);
}

export type CategoryValidity = { validFrom: number | null; validUntil: number | null };

/** Is the category meant to be used in this year? (null bounds = open) */
export function isCategoryActive(category: CategoryValidity, year: number): boolean {
  return (
    (category.validFrom === null || category.validFrom <= year) &&
    (category.validUntil === null || category.validUntil >= year)
  );
}

export function validityLabel(category: CategoryValidity): string | null {
  const { validFrom, validUntil } = category;
  if (validFrom !== null && validUntil !== null) {
    return validFrom === validUntil ? `nur ${validFrom}` : `${validFrom}–${validUntil}`;
  }
  if (validFrom !== null) return `ab ${validFrom}`;
  if (validUntil !== null) return `bis ${validUntil}`;
  return null;
}

/** Display form of an organisation name: trimmed, inner whitespace collapsed. */
export function normalizeCompanyName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

/** Matching key – must stay in sync with the SQL backfill in 20261010120000_finance_companies. */
export function companyNameKey(name: string): string {
  return normalizeCompanyName(name).toLowerCase();
}

/**
 * Loose key for spotting likely duplicates: ignores punctuation, legal forms
 * and a trailing city, e.g. «Kunsthaus Zürich AG» ≈ «Kunsthaus».
 */
export function companyLooseKey(name: string): string {
  return companyNameKey(name)
    .replace(/[^\p{L}\p{N} ]/gu, " ")
    .replace(/\b(ag|gmbh|sa|sàrl|sarl|kg|genossenschaft|verein|stiftung|zürich|zurich)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Accepts «Bearer <token>», but also «Bearer<token>» or the bare token –
 * whitespace easily gets lost in Zapier header fields.
 */
export function tokenFromHeaders(headers: Headers): string | null {
  const auth = headers.get("authorization")?.trim();
  if (auth) return auth.replace(/^bearer\s*/i, "").trim() || null;
  return headers.get("x-webhook-token")?.trim() || null;
}
