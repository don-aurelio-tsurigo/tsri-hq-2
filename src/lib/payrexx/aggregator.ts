import { categoryLabel, categoryMwst, CATEGORIES } from "./categories";
import { categorizeLines } from "./categorizer";
import type {
  CategoryTotal,
  DayCategoryRow,
  LineItem,
  PayoutStatusValue,
  PayoutSummary,
} from "./types";
import {
  FEES_KEY,
  PAYOUT_FEE_KEY,
  UNMAPPED_KEY,
  isPayoutFee,
  roundMoney,
} from "./types";

function emptyTotals(): Record<string, CategoryTotal> {
  const totals: Record<string, CategoryTotal> = {};
  for (const [key, meta] of Object.entries(CATEGORIES)) {
    totals[key] = {
      key,
      label: meta.label,
      mwst: meta.mwst,
      netto: 0,
      brutto: 0,
      fees: 0,
      count: 0,
    };
  }
  return totals;
}

export function computeTotals(lines: LineItem[]): {
  totals: Record<string, CategoryTotal>;
  payoutFee: number;
  unmappedCount: number;
} {
  const totals = emptyTotals();
  if (!totals[FEES_KEY]) {
    totals[FEES_KEY] = {
      key: FEES_KEY,
      label: categoryLabel(FEES_KEY),
      mwst: categoryMwst(FEES_KEY),
      netto: 0,
      brutto: 0,
      fees: 0,
      count: 0,
    };
  }

  let payoutFee = 0;
  let unmappedCount = 0;
  let feeTotal = 0;
  let feeCount = 0;

  for (const line of lines) {
    const key = line.categoryKey || UNMAPPED_KEY;

    if (key === PAYOUT_FEE_KEY || isPayoutFee(line)) {
      const feeAmount = line.total !== 0 ? line.total : line.fees;
      feeTotal = roundMoney(feeTotal + feeAmount);
      feeCount += 1;
      payoutFee = roundMoney(payoutFee + feeAmount);
      continue;
    }

    if (!totals[key]) {
      totals[key] = {
        key,
        label: categoryLabel(key),
        mwst: categoryMwst(key),
        netto: 0,
        brutto: 0,
        fees: 0,
        count: 0,
      };
    }

    const t = totals[key]!;
    t.brutto = roundMoney(t.brutto + line.amount);
    t.fees = roundMoney(t.fees + line.fees);
    t.netto = roundMoney(t.netto + line.amount);
    t.count += 1;

    if (line.fees !== 0) {
      feeTotal = roundMoney(feeTotal + line.fees);
      feeCount += 1;
    }

    if (key === UNMAPPED_KEY) unmappedCount += 1;
  }

  const feesRow = totals[FEES_KEY]!;
  feesRow.netto = feeTotal;
  feesRow.brutto = 0;
  feesRow.fees = feeTotal;
  feesRow.count = feeCount;

  if (totals[PAYOUT_FEE_KEY]) {
    totals[PAYOUT_FEE_KEY] = {
      key: PAYOUT_FEE_KEY,
      label: categoryLabel(PAYOUT_FEE_KEY),
      mwst: categoryMwst(PAYOUT_FEE_KEY),
      netto: 0,
      brutto: 0,
      fees: 0,
      count: 0,
    };
  }

  return { totals, payoutFee, unmappedCount };
}

export function computeDayCategoryBreakdown(
  lines: LineItem[],
): DayCategoryRow[] {
  const buckets = new Map<string, DayCategoryRow>();

  function add(date: string, key: string, amount: number) {
    const day = date || "unbekannt";
    const mapKey = `${day}::${key}`;
    let slot = buckets.get(mapKey);
    if (!slot) {
      slot = {
        date: day,
        key,
        label: categoryLabel(key),
        mwst: categoryMwst(key),
        netto: 0,
        count: 0,
      };
      buckets.set(mapKey, slot);
    }
    slot.netto = roundMoney(slot.netto + amount);
    slot.count += 1;
  }

  for (const line of lines) {
    const key = line.categoryKey || UNMAPPED_KEY;
    if (key === PAYOUT_FEE_KEY || isPayoutFee(line)) {
      const feeAmount = line.total !== 0 ? line.total : line.fees;
      add(line.date || "", FEES_KEY, feeAmount);
      continue;
    }
    add(line.date || "", key, line.amount);
    if (line.fees !== 0) {
      add(line.date || "", FEES_KEY, line.fees);
    }
  }

  return [...buckets.values()].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    const labelCmp = a.label.localeCompare(b.label, "de");
    if (labelCmp !== 0) return labelCmp;
    return a.key.localeCompare(b.key);
  });
}

export function aggregate(
  lines: LineItem[],
  opts: {
    uuid?: string;
    date?: string | null;
    currency?: string | null;
    statement?: string | null;
    learned?: Record<string, string>;
  } = {},
): PayoutSummary {
  categorizeLines(lines, opts.learned ?? {});
  const { totals, payoutFee, unmappedCount } = computeTotals(lines);
  const dayTotals = computeDayCategoryBreakdown(lines);

  let resolvedDate = opts.date ?? null;
  if (!resolvedDate) {
    for (const line of lines) {
      if (isPayoutFee(line) && line.date) {
        resolvedDate = line.date;
        break;
      }
    }
  }
  if (!resolvedDate) {
    for (const line of lines) {
      if (line.date) {
        resolvedDate = line.date;
        break;
      }
    }
  }
  resolvedDate = resolvedDate || "unbekannt";

  let resolvedCurrency = opts.currency ?? null;
  if (!resolvedCurrency) {
    for (const line of lines) {
      if (line.currency) {
        resolvedCurrency = line.currency;
        break;
      }
    }
  }
  resolvedCurrency = resolvedCurrency || "CHF";

  const grandTotal = roundMoney(
    lines.reduce((sum, line) => sum + line.total, 0),
  );
  const status: PayoutStatusValue = unmappedCount
    ? "braucht Review"
    : "vollständig";

  const uuid =
    opts.uuid ||
    `file-${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;

  return {
    uuid,
    date: resolvedDate,
    currency: resolvedCurrency,
    status,
    lines,
    totals,
    dayTotals,
    payoutFee,
    grandTotal,
    unmappedCount,
    statement: opts.statement ?? null,
  };
}

export function recomputePayoutMeta(lines: {
  total: number;
  categoryKey: string | null;
  typ: string;
}[]): {
  grandTotal: number;
  payoutFee: number;
  unmappedCount: number;
  status: PayoutStatusValue;
} {
  let grandTotal = 0;
  let payoutFee = 0;
  let unmappedCount = 0;
  for (const line of lines) {
    grandTotal = roundMoney(grandTotal + line.total);
    if (line.categoryKey === PAYOUT_FEE_KEY || line.typ === "payout-fee") {
      payoutFee = roundMoney(payoutFee + line.total);
    }
    if (line.categoryKey === UNMAPPED_KEY) unmappedCount += 1;
  }
  return {
    grandTotal,
    payoutFee,
    unmappedCount,
    status: unmappedCount ? "braucht Review" : "vollständig",
  };
}
