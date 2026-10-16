/** Client-safe helpers for sales commissions (no Prisma imports). */

import { addMonths, monthKey, parseMonthKey, roundCents, type MonthKey } from "./shared";

// ─── Abrechnungsperiode ────────────────────────────────────────
// Eine Periode läuft vom 21. des Vormonats bis zum 20. und heisst nach ihrem Endmonat:
// Periode «2026-10» = 21.09.2026–20.10.2026.

export const PERIOD_CUTOFF_DAY = 20;

/** Period of a sale date (UTC date, as DATE columns come back). */
export function commissionPeriodOf(date: Date): MonthKey {
  const key = monthKey(date.getUTCFullYear(), date.getUTCMonth());
  return date.getUTCDate() > PERIOD_CUTOFF_DAY ? addMonths(key, 1) : key;
}

/** First and last day of a period (both inclusive, UTC midnight). */
export function commissionPeriodRange(period: MonthKey): { from: Date; to: Date } {
  const [y, m] = parseMonthKey(period);
  return {
    from: new Date(Date.UTC(y, m - 1, PERIOD_CUTOFF_DAY + 1)),
    to: new Date(Date.UTC(y, m, PERIOD_CUTOFF_DAY)),
  };
}

/** «21.09.–20.10.2026» */
export function commissionPeriodRangeLabel(period: MonthKey): string {
  const { from, to } = commissionPeriodRange(period);
  const d = (x: Date) =>
    `${String(x.getUTCDate()).padStart(2, "0")}.${String(x.getUTCMonth() + 1).padStart(2, "0")}.`;
  return `${d(from)}–${d(to)}${to.getUTCFullYear()}`;
}

/** Periods from `from` to `to`, both inclusive. */
export function commissionPeriodsBetween(from: MonthKey, to: MonthKey): MonthKey[] {
  const out: MonthKey[] = [];
  for (let p = from; p <= to; p = addMonths(p, 1)) out.push(p);
  return out;
}

// ─── Formel ────────────────────────────────────────────────────

export type CommissionBasis = "intern" | "total";

/** Rates as fractions (0.25 = 25 %). */
export type CommissionModelParams = {
  baseAmount: number;
  externRate: number;
  internRateMin: number;
  internRateMax: number;
  /** Above this total (intern + extern) the maximum intern rate applies */
  threshold: number;
  /** Amount the intern rate progresses on, up to the threshold */
  progressionBasis: CommissionBasis;
};

export type CommissionResult = {
  intern: number;
  extern: number;
  internRate: number;
  base: number;
  internPart: number;
  externPart: number;
  amount: number;
};

/**
 * Provision = Grundbetrag + extern × Satz extern + intern × Satz intern.
 * Satz intern steigt linear von min. bis max. (erreicht bei der Schwelle);
 * liegt das Total (intern + extern) über der Schwelle, gilt max.
 */
export function calculateCommission(
  model: CommissionModelParams,
  intern: number,
  extern: number,
): CommissionResult {
  const total = intern + extern;
  let internRate = model.internRateMax;
  if (total <= model.threshold && model.threshold > 0) {
    const basis = model.progressionBasis === "total" ? total : intern;
    const progress = Math.min(Math.max(basis / model.threshold, 0), 1);
    internRate = model.internRateMin + (model.internRateMax - model.internRateMin) * progress;
  }
  const internPart = intern * internRate;
  const externPart = extern * model.externRate;
  return {
    intern: roundCents(intern),
    extern: roundCents(extern),
    internRate,
    base: model.baseAmount,
    internPart: roundCents(internPart),
    externPart: roundCents(externPart),
    amount: roundCents(model.baseAmount + internPart + externPart),
  };
}

// ─── Zuweisungen ───────────────────────────────────────────────

export type CommissionAssignmentRange = {
  validFrom: MonthKey;
  /** Inclusive; null = open-ended */
  validUntil: MonthKey | null;
};

export function isAssignmentActive(a: CommissionAssignmentRange, period: MonthKey): boolean {
  return a.validFrom <= period && (a.validUntil === null || period <= a.validUntil);
}

/** The assignment valid in a period (assignments of one person must not overlap). */
export function activeAssignment<T extends CommissionAssignmentRange>(
  assignments: T[],
  period: MonthKey,
): T | null {
  return assignments.find((a) => isAssignmentActive(a, period)) ?? null;
}

/** Error message when ranges of one person are invalid or overlap, else null. */
export function assignmentRangeError(assignments: CommissionAssignmentRange[]): string | null {
  const sorted = [...assignments].sort((a, b) => a.validFrom.localeCompare(b.validFrom));
  for (const a of sorted) {
    if (a.validUntil !== null && a.validUntil < a.validFrom) {
      return "«Gültig bis» liegt vor «gültig ab».";
    }
  }
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    if (prev.validUntil === null || prev.validUntil >= sorted[i].validFrom) {
      return "Zuweisungen überschneiden sich.";
    }
  }
  return null;
}

// ─── Deals ─────────────────────────────────────────────────────

export type CommissionSplit = { intern: number; extern: number };

/** Difference between split and deal total (0 = consistent). */
export function commissionSplitDiff(total: number, split: CommissionSplit): number {
  return roundCents(split.intern + split.extern - total);
}

export type CommissionDealInput = {
  soldAt: Date;
  intern: number;
  extern: number;
};

/** Sums of relevant deals per period. */
export function sumDealsByPeriod(deals: CommissionDealInput[]): Map<MonthKey, CommissionSplit & { count: number }> {
  const out = new Map<MonthKey, CommissionSplit & { count: number }>();
  for (const d of deals) {
    const period = commissionPeriodOf(d.soldAt);
    const s = out.get(period) ?? { intern: 0, extern: 0, count: 0 };
    s.intern = roundCents(s.intern + d.intern);
    s.extern = roundCents(s.extern + d.extern);
    s.count += 1;
    out.set(period, s);
  }
  return out;
}
