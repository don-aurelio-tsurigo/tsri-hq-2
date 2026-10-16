/** Server side of sales commissions: deal assignment and period locks. */

import { prisma } from "@/lib/db";
import {
  activeAssignment,
  assignmentRangeError,
  calculateCommission,
  commissionPeriodOf,
  commissionPeriodRange,
  commissionPeriodsBetween,
  commissionSplitDiff,
  type CommissionBasis,
  type CommissionModelParams,
  type CommissionResult,
} from "./commission";
import { monthKeyFromDate, monthKeyToDate, roundCents, type MonthKey } from "./shared";

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

// ─── Modelle ───────────────────────────────────────────────────

export type CommissionModelInput = CommissionModelParams & { name: string; notes: string | null };

export type CommissionModelRow = CommissionModelInput & {
  id: string;
  archived: boolean;
  assignmentCount: number;
};

type ModelRecord = {
  id: string;
  name: string;
  baseAmount: Decimalish;
  externRate: Decimalish;
  internRateMin: Decimalish;
  internRateMax: Decimalish;
  threshold: Decimalish;
  progressionBasis: CommissionBasis;
};
type Decimalish = { toString(): string };

function modelParams(m: ModelRecord): CommissionModelParams {
  return {
    baseAmount: Number(m.baseAmount),
    externRate: Number(m.externRate),
    internRateMin: Number(m.internRateMin),
    internRateMax: Number(m.internRateMax),
    threshold: Number(m.threshold),
    progressionBasis: m.progressionBasis,
  };
}

export async function listCommissionModels(organizationId: string): Promise<CommissionModelRow[]> {
  const rows = await prisma.financeCommissionModel.findMany({
    where: { organizationId },
    orderBy: [{ archivedAt: { sort: "asc", nulls: "first" } }, { name: "asc" }],
    include: { _count: { select: { assignments: true } } },
  });
  return rows.map((m) => ({
    id: m.id,
    name: m.name,
    notes: m.notes,
    ...modelParams(m),
    archived: m.archivedAt !== null,
    assignmentCount: m._count.assignments,
  }));
}

function validateModel(input: CommissionModelInput): string | null {
  if (!input.name.trim()) return "Name fehlt.";
  const rates = [input.externRate, input.internRateMin, input.internRateMax];
  if (!rates.every((r) => Number.isFinite(r) && r >= 0 && r <= 1)) return "Sätze müssen zwischen 0 und 100 % liegen.";
  if (input.internRateMin > input.internRateMax) return "Satz intern min. ist grösser als max.";
  if (!Number.isFinite(input.baseAmount) || input.baseAmount < 0 || input.baseAmount >= 1e9) return "Ungültiger Grundbetrag.";
  if (!Number.isFinite(input.threshold) || input.threshold <= 0 || input.threshold >= 1e11) return "Schwelle muss grösser als 0 sein.";
  if (input.progressionBasis !== "intern" && input.progressionBasis !== "total") return "Ungültige Progressionsbasis.";
  return null;
}

function modelData(input: CommissionModelInput) {
  return {
    name: input.name.trim().slice(0, 200),
    notes: input.notes?.trim().slice(0, 5000) || null,
    baseAmount: roundCents(input.baseAmount),
    externRate: input.externRate,
    internRateMin: input.internRateMin,
    internRateMax: input.internRateMax,
    threshold: roundCents(input.threshold),
    progressionBasis: input.progressionBasis,
  };
}

async function assertUniqueModelName(organizationId: string, name: string, exceptId?: string) {
  const clash = await prisma.financeCommissionModel.findFirst({
    where: { organizationId, name: { equals: name.trim(), mode: "insensitive" }, id: { not: exceptId } },
    select: { id: true },
  });
  if (clash) throw new CommissionError("Es gibt bereits ein Modell mit diesem Namen.");
}

export async function createCommissionModel(organizationId: string, input: CommissionModelInput) {
  const error = validateModel(input);
  if (error) throw new CommissionError(error);
  await assertUniqueModelName(organizationId, input.name);
  await prisma.financeCommissionModel.create({ data: { organizationId, ...modelData(input) } });
}

/** Closed periods keep their snapshot, so changing parameters only affects open periods. */
export async function updateCommissionModel(organizationId: string, id: string, input: CommissionModelInput) {
  const error = validateModel(input);
  if (error) throw new CommissionError(error);
  await assertUniqueModelName(organizationId, input.name, id);
  const res = await prisma.financeCommissionModel.updateMany({
    where: { id, organizationId },
    data: modelData(input),
  });
  if (res.count === 0) throw new CommissionError("Modell nicht gefunden.");
}

export async function setCommissionModelArchived(organizationId: string, id: string, archived: boolean) {
  const res = await prisma.financeCommissionModel.updateMany({
    where: { id, organizationId },
    data: { archivedAt: archived ? new Date() : null },
  });
  if (res.count === 0) throw new CommissionError("Modell nicht gefunden.");
}

// ─── Zuweisungen ───────────────────────────────────────────────

export type CommissionAssignmentRow = {
  id: string;
  user: SalesPerson;
  modelId: string;
  modelName: string;
  validFrom: MonthKey;
  validUntil: MonthKey | null;
};

export async function listCommissionAssignments(organizationId: string): Promise<CommissionAssignmentRow[]> {
  const rows = await prisma.financeCommissionAssignment.findMany({
    where: { organizationId },
    orderBy: [{ user: { name: "asc" } }, { validFrom: "asc" }],
    include: { user: { select: { id: true, name: true } }, model: { select: { name: true } } },
  });
  return rows.map((a) => ({
    id: a.id,
    user: a.user,
    modelId: a.modelId,
    modelName: a.model.name,
    validFrom: monthKeyFromDate(a.validFrom),
    validUntil: a.validUntil ? monthKeyFromDate(a.validUntil) : null,
  }));
}

export type CommissionAssignmentInput = {
  id: string | null;
  userId: string;
  modelId: string;
  validFrom: MonthKey;
  validUntil: MonthKey | null;
};

export async function saveCommissionAssignment(organizationId: string, input: CommissionAssignmentInput) {
  const [model, others, existing] = await Promise.all([
    prisma.financeCommissionModel.findFirst({
      where: { id: input.modelId, organizationId },
      select: { archivedAt: true },
    }),
    prisma.financeCommissionAssignment.findMany({
      where: { organizationId, userId: input.userId, id: { not: input.id ?? undefined } },
      select: { validFrom: true, validUntil: true },
    }),
    input.id
      ? prisma.financeCommissionAssignment.findFirst({
          where: { id: input.id, organizationId },
          select: { userId: true },
        })
      : null,
  ]);
  if (!model) throw new CommissionError("Modell nicht gefunden.");
  if (input.id && !existing) throw new CommissionError("Zuweisung nicht gefunden.");
  if (!existing || existing.userId !== input.userId) {
    if (model.archivedAt) throw new CommissionError("Das Modell ist archiviert.");
    const people = await listSalesPeople(organizationId);
    if (!people.some((p) => p.id === input.userId)) {
      throw new CommissionError("Diese Person ist nicht als Sales markiert.");
    }
  }
  const error = assignmentRangeError([
    ...others.map((o) => ({
      validFrom: monthKeyFromDate(o.validFrom),
      validUntil: o.validUntil ? monthKeyFromDate(o.validUntil) : null,
    })),
    { validFrom: input.validFrom, validUntil: input.validUntil },
  ]);
  if (error) throw new CommissionError(error);

  const data = {
    userId: input.userId,
    modelId: input.modelId,
    validFrom: monthKeyToDate(input.validFrom),
    validUntil: input.validUntil ? monthKeyToDate(input.validUntil) : null,
  };
  if (input.id) await prisma.financeCommissionAssignment.update({ where: { id: input.id }, data });
  else await prisma.financeCommissionAssignment.create({ data: { organizationId, ...data } });
}

export async function deleteCommissionAssignment(organizationId: string, id: string) {
  await prisma.financeCommissionAssignment.deleteMany({ where: { id, organizationId } });
}

// ─── Periodenübersicht und Abschluss ───────────────────────────

export type CommissionDealRow = {
  id: string;
  title: string;
  company: string | null;
  /** "YYYY-MM-DD" */
  soldAt: string;
  intern: number;
  extern: number;
};

export type CommissionModelSnapshot = { modelId: string; name: string; params: CommissionModelParams };

export type CommissionPersonRow = {
  user: SalesPerson;
  model: CommissionModelSnapshot | null;
  deals: CommissionDealRow[];
  /** null = deals but no model assigned */
  result: CommissionResult | null;
};

export type CommissionPeriodOverview = {
  period: MonthKey;
  closed: { closedAt: string } | null;
  rows: CommissionPersonRow[];
  total: number;
  /** All deals still waiting for a commission decision */
  undecidedCount: number;
  /** Reasons the period cannot be closed (empty = can close) */
  closeBlockers: string[];
};

function todayIsoDate(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Zurich" });
}

export async function getCommissionPeriodOverview(
  organizationId: string,
  period: MonthKey,
  onlyUserId?: string,
): Promise<CommissionPeriodOverview> {
  const periodDate = monthKeyToDate(period);
  const { from, to } = commissionPeriodRange(period);
  const userFilter = onlyUserId ? { userId: onlyUserId } : {};

  const [closeRow, statements, assignments, deals, undecidedCount] = await Promise.all([
    prisma.financeCommissionPeriodClose.findUnique({
      where: { organizationId_period: { organizationId, period: periodDate } },
    }),
    prisma.financeCommissionStatement.findMany({
      where: { organizationId, period: periodDate, ...userFilter },
      include: { user: { select: { id: true, name: true } } },
    }),
    prisma.financeCommissionAssignment.findMany({
      where: {
        organizationId,
        ...userFilter,
        validFrom: { lte: periodDate },
        OR: [{ validUntil: null }, { validUntil: { gte: periodDate } }],
      },
      include: { user: { select: { id: true, name: true } }, model: true },
    }),
    prisma.financeDeal.findMany({
      where: {
        organizationId,
        commissionStatus: "relevant",
        soldAt: { gte: from, lte: to },
        ...(onlyUserId ? { salesUserId: onlyUserId } : {}),
      },
      orderBy: [{ soldAt: "asc" }, { createdAt: "asc" }],
      include: { company: { select: { name: true } }, salesUser: { select: { id: true, name: true } } },
    }),
    onlyUserId
      ? Promise.resolve(0)
      : prisma.financeDeal.count({
          where: { organizationId, commissionStatus: "undecided", status: { not: "ignored" } },
        }),
  ]);

  const rowsByUser = new Map<string, CommissionPersonRow>();
  const rowFor = (user: SalesPerson) => {
    let row = rowsByUser.get(user.id);
    if (!row) {
      row = { user, model: null, deals: [], result: null };
      rowsByUser.set(user.id, row);
    }
    return row;
  };

  for (const d of deals) {
    if (!d.salesUser || !d.soldAt) continue;
    rowFor(d.salesUser).deals.push({
      id: d.id,
      title: d.title,
      company: d.company?.name ?? null,
      soldAt: d.soldAt.toISOString().slice(0, 10),
      intern: Number(d.commissionIntern ?? 0),
      extern: Number(d.commissionExtern ?? 0),
    });
  }

  if (closeRow) {
    // Frozen: amounts and model come from the statements
    for (const s of statements) {
      const row = rowFor(s.user);
      row.model = (s.modelSnapshot as CommissionModelSnapshot | null) ?? null;
      const internSum = Number(s.internSum);
      const externSum = Number(s.externSum);
      row.result = row.model
        ? { ...calculateCommission(row.model.params, internSum, externSum), amount: Number(s.amount) }
        : { intern: internSum, extern: externSum, internRate: 0, base: 0, internPart: 0, externPart: 0, amount: Number(s.amount) };
    }
  } else {
    for (const a of assignments) {
      rowFor(a.user).model = { modelId: a.modelId, name: a.model.name, params: modelParams(a.model) };
    }
    for (const row of rowsByUser.values()) {
      if (!row.model) continue;
      const intern = row.deals.reduce((s, d) => s + d.intern, 0);
      const extern = row.deals.reduce((s, d) => s + d.extern, 0);
      row.result = calculateCommission(row.model.params, intern, extern);
    }
  }

  const rows = [...rowsByUser.values()].sort((a, b) => a.user.name.localeCompare(b.user.name, "de"));
  const closeBlockers: string[] = [];
  if (!closeRow) {
    if (todayIsoDate() <= to.toISOString().slice(0, 10)) {
      closeBlockers.push("Die Periode läuft noch.");
    }
    for (const r of rows) {
      if (!r.model) closeBlockers.push(`${r.user.name} hat Deals, aber kein Provisionsmodell.`);
    }
  }

  return {
    period,
    closed: closeRow ? { closedAt: closeRow.closedAt.toISOString() } : null,
    rows,
    total: roundCents(rows.reduce((s, r) => s + (r.result?.amount ?? 0), 0)),
    undecidedCount,
    closeBlockers,
  };
}

/** Freezes all statements of a period and locks its deals. */
export async function closeCommissionPeriod(organizationId: string, period: MonthKey, closedById: string) {
  const overview = await getCommissionPeriodOverview(organizationId, period);
  if (overview.closed) throw new CommissionError("Die Periode ist bereits abgeschlossen.");
  if (overview.closeBlockers.length) throw new CommissionError(overview.closeBlockers.join(" "));
  const periodDate = monthKeyToDate(period);
  await prisma.$transaction([
    prisma.financeCommissionPeriodClose.create({ data: { organizationId, period: periodDate, closedById } }),
    ...overview.rows.map((r) =>
      prisma.financeCommissionStatement.create({
        data: {
          organizationId,
          userId: r.user.id,
          period: periodDate,
          internSum: r.result?.intern ?? 0,
          externSum: r.result?.extern ?? 0,
          amount: r.result?.amount ?? 0,
          dealCount: r.deals.length,
          modelSnapshot: r.model ?? undefined,
          closedById,
        },
      }),
    ),
  ]);
}

export async function reopenCommissionPeriod(organizationId: string, period: MonthKey) {
  const periodDate = monthKeyToDate(period);
  await prisma.$transaction([
    prisma.financeCommissionStatement.deleteMany({ where: { organizationId, period: periodDate } }),
    prisma.financeCommissionPeriodClose.deleteMany({ where: { organizationId, period: periodDate } }),
  ]);
}

// ─── Jahresübersicht einer Person (Dashboard) ──────────────────

export type CommissionYearPeriod = {
  period: MonthKey;
  /** closed = abgerechnet, running = laufende Periode, open = vorbei, aber noch nicht abgeschlossen */
  state: "closed" | "running" | "open";
  /** Statement with deals; result null = deals but no model assigned */
  row: CommissionPersonRow;
};

/**
 * Periods of a year for one person, up to the current period (later ones only if they have deals).
 * Closed periods show the frozen amounts, open ones are calculated live.
 */
export async function getCommissionYearForUser(
  organizationId: string,
  user: SalesPerson,
  year: number,
): Promise<CommissionYearPeriod[]> {
  const periods = commissionPeriodsBetween(`${year}-01`, `${year}-12`);
  const first = monthKeyToDate(periods[0]);
  const last = monthKeyToDate(periods[periods.length - 1]);
  const current = commissionPeriodOf(new Date());

  const [closes, statements, assignments, deals] = await Promise.all([
    prisma.financeCommissionPeriodClose.findMany({
      where: { organizationId, period: { gte: first, lte: last } },
      select: { period: true },
    }),
    prisma.financeCommissionStatement.findMany({
      where: { organizationId, userId: user.id, period: { gte: first, lte: last } },
    }),
    prisma.financeCommissionAssignment.findMany({
      where: { organizationId, userId: user.id },
      include: { model: true },
    }),
    prisma.financeDeal.findMany({
      where: {
        organizationId,
        salesUserId: user.id,
        commissionStatus: "relevant",
        soldAt: {
          gte: commissionPeriodRange(periods[0]).from,
          lte: commissionPeriodRange(periods[periods.length - 1]).to,
        },
      },
      orderBy: [{ soldAt: "asc" }, { createdAt: "asc" }],
      include: { company: { select: { name: true } } },
    }),
  ]);

  const closed = new Set(closes.map((c) => monthKeyFromDate(c.period)));
  const statementBy = new Map(statements.map((s) => [monthKeyFromDate(s.period), s]));
  const ranges = assignments.map((a) => ({
    validFrom: monthKeyFromDate(a.validFrom),
    validUntil: a.validUntil ? monthKeyFromDate(a.validUntil) : null,
    model: a.model,
  }));
  const dealsBy = new Map<MonthKey, CommissionDealRow[]>();
  for (const d of deals) {
    if (!d.soldAt) continue;
    const period = commissionPeriodOf(d.soldAt);
    const list = dealsBy.get(period) ?? [];
    list.push({
      id: d.id,
      title: d.title,
      company: d.company?.name ?? null,
      soldAt: d.soldAt.toISOString().slice(0, 10),
      intern: Number(d.commissionIntern ?? 0),
      extern: Number(d.commissionExtern ?? 0),
    });
    dealsBy.set(period, list);
  }

  const out: CommissionYearPeriod[] = [];
  for (const period of periods) {
    const periodDeals = dealsBy.get(period) ?? [];
    if (closed.has(period)) {
      const s = statementBy.get(period);
      if (!s) continue;
      const model = (s.modelSnapshot as CommissionModelSnapshot | null) ?? null;
      const internSum = Number(s.internSum);
      const externSum = Number(s.externSum);
      out.push({
        period,
        state: "closed",
        row: {
          user,
          model,
          deals: periodDeals,
          result: model
            ? { ...calculateCommission(model.params, internSum, externSum), amount: Number(s.amount) }
            : null,
        },
      });
      continue;
    }
    if (period > current && periodDeals.length === 0) continue;
    const assignment = activeAssignment(ranges, period);
    if (!assignment && periodDeals.length === 0) continue;
    const model = assignment
      ? { modelId: assignment.model.id, name: assignment.model.name, params: modelParams(assignment.model) }
      : null;
    const intern = periodDeals.reduce((sum, d) => sum + d.intern, 0);
    const extern = periodDeals.reduce((sum, d) => sum + d.extern, 0);
    out.push({
      period,
      state: period >= current ? "running" : "open",
      row: {
        user,
        model,
        deals: periodDeals,
        result: model ? calculateCommission(model.params, intern, extern) : null,
      },
    });
  }
  return out;
}
