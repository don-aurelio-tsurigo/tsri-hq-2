/** Server side of sales commissions: deal assignment and period locks. */

import { prisma } from "@/lib/db";
import { commissionPeriodOf, commissionSplitDiff } from "./commission";
import { monthKeyToDate, roundCents, type MonthKey } from "./shared";

export type CommissionStatus = "undecided" | "relevant" | "not_relevant";

export type SalesPerson = { id: string; name: string };

export class CommissionError extends Error {}

/** Members tagged «Sales» (not archived), plus extra users already on deals. */
export async function listSalesPeople(
  organizationId: string,
  include: (SalesPerson | null)[] = [],
): Promise<SalesPerson[]> {
  const rows = await prisma.membership.findMany({
    where: { organizationId, archivedAt: null, grants: { some: { capability: "sales" } } },
    select: { user: { select: { id: true, name: true } } },
  });
  const map = new Map(rows.map((r) => [r.user.id, r.user]));
  for (const p of include) if (p && !map.has(p.id)) map.set(p.id, p);
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "de"));
}

/** Sales person whose name matches the deal owner from Pipedrive (first name is enough). */
export function matchSalesPerson(people: SalesPerson[], responsibleName: string | null): SalesPerson | null {
  const wanted = responsibleName?.trim().toLowerCase();
  if (!wanted) return null;
  const exact = people.find((p) => p.name.toLowerCase() === wanted);
  if (exact) return exact;
  const first = wanted.split(/\s+/)[0];
  const byFirst = people.filter((p) => p.name.toLowerCase().split(/\s+/)[0] === first);
  return byFirst.length === 1 ? byFirst[0] : null;
}

export async function isCommissionPeriodClosed(organizationId: string, period: MonthKey): Promise<boolean> {
  const row = await prisma.financeCommissionPeriodClose.findUnique({
    where: { organizationId_period: { organizationId, period: monthKeyToDate(period) } },
    select: { id: true },
  });
  return row !== null;
}

/** Period a deal is billed in, or null when it does not count for commissions. */
export function dealCommissionPeriod(deal: {
  commissionStatus: CommissionStatus;
  soldAt: Date | null;
}): MonthKey | null {
  return deal.commissionStatus === "relevant" && deal.soldAt ? commissionPeriodOf(deal.soldAt) : null;
}

export type DealCommissionInput = {
  status: CommissionStatus;
  salesUserId: string | null;
  /** "YYYY-MM-DD" */
  soldAt: string | null;
  intern: number | null;
  extern: number | null;
};

function parseIsoDate(v: string | null): Date | null {
  const m = v ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(v) : null;
  if (!m) return null;
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(date.getTime()) || date.getUTCDate() !== Number(m[3]) ? null : date;
}

/**
 * Sets the commission decision of a deal. Deals in a closed period are locked:
 * neither the old nor the new period may be closed.
 */
export async function saveDealCommission(
  organizationId: string,
  dealId: string,
  input: DealCommissionInput,
): Promise<void> {
  const deal = await prisma.financeDeal.findFirst({
    where: { id: dealId, organizationId },
    select: { commissionStatus: true, soldAt: true, salesUserId: true },
  });
  if (!deal) throw new CommissionError("Deal nicht gefunden.");

  const oldPeriod = dealCommissionPeriod(deal);
  if (oldPeriod && (await isCommissionPeriodClosed(organizationId, oldPeriod))) {
    throw new CommissionError("Die Abrechnungsperiode dieses Deals ist abgeschlossen.");
  }

  if (input.status !== "relevant") {
    // Keep the details so switching back does not lose them
    await prisma.financeDeal.update({
      where: { id: dealId },
      data: { commissionStatus: input.status },
    });
    return;
  }

  const soldAt = parseIsoDate(input.soldAt);
  if (!soldAt) throw new CommissionError("Verkaufsdatum fehlt.");
  if (!input.salesUserId) throw new CommissionError("Sales-Person fehlt.");
  const people = await listSalesPeople(organizationId);
  if (!people.some((p) => p.id === input.salesUserId) && input.salesUserId !== deal.salesUserId) {
    throw new CommissionError("Diese Person ist nicht als Sales markiert.");
  }
  const intern = input.intern ?? 0;
  const extern = input.extern ?? 0;
  if (![intern, extern].every((n) => Number.isFinite(n) && Math.abs(n) < 1e11)) {
    throw new CommissionError("Ungültiger Betrag.");
  }
  const newPeriod = commissionPeriodOf(soldAt);
  if (await isCommissionPeriodClosed(organizationId, newPeriod)) {
    throw new CommissionError("Die Abrechnungsperiode zu diesem Verkaufsdatum ist bereits abgeschlossen.");
  }

  await prisma.financeDeal.update({
    where: { id: dealId },
    data: {
      commissionStatus: "relevant",
      salesUserId: input.salesUserId,
      soldAt,
      commissionIntern: roundCents(intern),
      commissionExtern: roundCents(extern),
    },
  });
}

export type DealCommission = {
  status: CommissionStatus;
  salesUser: SalesPerson | null;
  /** "YYYY-MM-DD" */
  soldAt: string | null;
  intern: number | null;
  extern: number | null;
  period: MonthKey | null;
  locked: boolean;
  /** Split minus deal total (0 = consistent) */
  splitDiff: number;
};

export async function getDealCommission(
  organizationId: string,
  deal: {
    commissionStatus: CommissionStatus;
    soldAt: Date | null;
    commissionIntern: { toString(): string } | null;
    commissionExtern: { toString(): string } | null;
    totalAmount: { toString(): string };
    salesUser: SalesPerson | null;
  },
): Promise<DealCommission> {
  const period = dealCommissionPeriod(deal);
  const intern = deal.commissionIntern === null ? null : Number(deal.commissionIntern);
  const extern = deal.commissionExtern === null ? null : Number(deal.commissionExtern);
  return {
    status: deal.commissionStatus,
    salesUser: deal.salesUser,
    soldAt: deal.soldAt ? deal.soldAt.toISOString().slice(0, 10) : null,
    intern,
    extern,
    period,
    locked: period ? await isCommissionPeriodClosed(organizationId, period) : false,
    splitDiff:
      intern === null && extern === null
        ? 0
        : commissionSplitDiff(Number(deal.totalAmount), { intern: intern ?? 0, extern: extern ?? 0 }),
  };
}
