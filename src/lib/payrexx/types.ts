/** Shared constants & types for Payrexx payout bookkeeping. */

export const UNMAPPED_KEY = "unmapped";
export const PAYOUT_FEE_KEY = "payout_fee";
export const FEES_KEY = "gebuehren";

export type PayoutStatusValue = "vollständig" | "braucht Review";

export type CategoryMeta = {
  label: string;
  mwst: string | null;
};

export type LineItem = {
  typ: string;
  transactionId: string | null;
  date: string | null;
  time: string | null;
  amount: number;
  fees: number;
  total: number;
  currency: string;
  description: string | null;
  channel: string | null;
  paymentMethod: string | null;
  customer: string | null;
  externalReference: string | null;
  instance: string | null;
  categoryKey?: string | null;
  categorySource?: string | null;
};

export type CategoryTotal = {
  key: string;
  label: string;
  mwst: string | null;
  netto: number;
  brutto: number;
  fees: number;
  count: number;
};

export type DayCategoryRow = {
  date: string;
  key: string;
  label: string;
  mwst: string | null;
  netto: number;
  count: number;
};

export type PayoutSummary = {
  uuid: string;
  date: string;
  currency: string;
  status: PayoutStatusValue;
  lines: LineItem[];
  totals: Record<string, CategoryTotal>;
  dayTotals: DayCategoryRow[];
  payoutFee: number;
  grandTotal: number;
  unmappedCount: number;
  statement: string | null;
};

export function isPayoutFee(line: Pick<LineItem, "typ">): boolean {
  return line.typ === "payout-fee";
}

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}
