import { prisma } from "@/lib/db";
import {
  isCategoryActive,
  monthKeyFromDate,
  monthKeyToDate,
  monthsOfYear,
  type CellValues,
  type FinanceKind,
  type MonthKey,
} from "./shared";

export type OverviewCategory = {
  id: string;
  name: string;
  kind: FinanceKind;
  group: string | null;
  validFrom: number | null;
  validUntil: number | null;
  /** Not valid in this year, but shown because it has numbers */
  inactive: boolean;
};

export type BudgetOverview = {
  year: number;
  years: number[];
  months: MonthKey[];
  closedMonths: MonthKey[];
  categories: OverviewCategory[];
  /** categoryId → monthKey → values */
  cells: Record<string, Record<MonthKey, CellValues>>;
};

function yearRange(year: number) {
  return {
    gte: new Date(Date.UTC(year, 0, 1)),
    lt: new Date(Date.UTC(year + 1, 0, 1)),
  };
}

export async function availableYears(organizationId: string): Promise<number[]> {
  const rows = await prisma.$queryRaw<{ year: number }[]>`
    SELECT DISTINCT EXTRACT(YEAR FROM "month")::int AS year
    FROM finance_budget_entry WHERE "organizationId" = ${organizationId}
    UNION
    SELECT DISTINCT EXTRACT(YEAR FROM "month")::int AS year
    FROM finance_booking WHERE "organizationId" = ${organizationId}
    UNION
    SELECT "year" FROM finance_year WHERE "organizationId" = ${organizationId}
  `;
  const years = new Set(rows.map((r) => r.year));
  years.add(new Date().getFullYear());
  return [...years].sort((a, b) => a - b);
}

export async function getBudgetOverview(
  organizationId: string,
  year: number,
): Promise<BudgetOverview> {
  const range = yearRange(year);
  const [categories, entries, actuals, closes, years] = await Promise.all([
    prisma.financeCategory.findMany({
      where: { organizationId, liquidityOnly: false, archivedAt: null },
      orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        kind: true,
        group: true,
        validFrom: true,
        validUntil: true,
      },
    }),
    prisma.financeBudgetEntry.findMany({
      where: { organizationId, month: range },
      select: { categoryId: true, month: true, budget: true, forecast: true },
    }),
    prisma.financeBooking.groupBy({
      by: ["categoryId", "month"],
      where: { organizationId, month: range },
      _sum: { amount: true },
    }),
    prisma.financeMonthClose.findMany({
      where: { organizationId, month: range },
      select: { month: true },
    }),
    availableYears(organizationId),
  ]);

  const cells: BudgetOverview["cells"] = {};
  const cell = (categoryId: string, key: MonthKey) => {
    const byMonth = (cells[categoryId] ??= {});
    return (byMonth[key] ??= { budget: 0, forecast: 0, actual: 0 });
  };
  for (const e of entries) {
    const c = cell(e.categoryId, monthKeyFromDate(e.month));
    c.budget = Number(e.budget);
    c.forecast = Number(e.forecast);
  }
  for (const a of actuals) {
    cell(a.categoryId, monthKeyFromDate(a.month)).actual = Number(
      a._sum.amount ?? 0,
    );
  }

  const allYears = new Set([...years, year]);

  // Categories valid this year, plus expired/future ones that still carry numbers
  const hasNumbers = (id: string) =>
    Object.values(cells[id] ?? {}).some((c) => c.budget || c.forecast || c.actual);
  const visible = categories.flatMap((c) => {
    const active = isCategoryActive(c, year);
    if (!active && !hasNumbers(c.id)) return [];
    return [{ ...c, kind: c.kind as FinanceKind, inactive: !active }];
  });

  return {
    year,
    years: [...allYears].sort((a, b) => a - b),
    months: monthsOfYear(year),
    closedMonths: closes.map((c) => monthKeyFromDate(c.month)),
    // income first (enum order), then expense
    categories: visible,
    cells,
  };
}

export type CellBooking = {
  id: string;
  month: MonthKey;
  title: string;
  amount: number;
  company: { id: string; name: string } | null;
  responsibleName: string | null;
  bexioUrl: string | null;
  notes: string | null;
  deal: { id: string; title: string; bookingCount: number } | null;
};

/** Bookings behind an Effektiv cell (one month) or a year total (months = whole year). */
export async function listCellBookings(
  organizationId: string,
  categoryId: string,
  months: MonthKey[],
): Promise<CellBooking[]> {
  const rows = await prisma.financeBooking.findMany({
    where: {
      organizationId,
      categoryId,
      month: { in: months.map(monthKeyToDate) },
    },
    orderBy: [{ month: "asc" }, { amount: "desc" }, { title: "asc" }],
    include: {
      company: { select: { id: true, name: true } },
      deal: {
        select: { id: true, title: true, _count: { select: { bookings: true } } },
      },
    },
  });
  return rows.map((b) => ({
    id: b.id,
    month: monthKeyFromDate(b.month),
    title: b.title,
    amount: Number(b.amount),
    company: b.company,
    responsibleName: b.responsibleName,
    bexioUrl: b.bexioUrl,
    notes: b.notes,
    deal: b.deal
      ? { id: b.deal.id, title: b.deal.title, bookingCount: b.deal._count.bookings }
      : null,
  }));
}

export async function setBudgetValue(input: {
  organizationId: string;
  categoryId: string;
  month: MonthKey;
  field: "budget" | "forecast";
  value: number;
  userId: string;
}): Promise<boolean> {
  const category = await prisma.financeCategory.findFirst({
    where: { id: input.categoryId, organizationId: input.organizationId },
    select: { id: true },
  });
  if (!category) return false;

  const month = monthKeyToDate(input.month);
  await prisma.financeBudgetEntry.upsert({
    where: { categoryId_month: { categoryId: category.id, month } },
    create: {
      organizationId: input.organizationId,
      categoryId: category.id,
      month,
      [input.field]: input.value,
      updatedById: input.userId,
    },
    update: { [input.field]: input.value, updatedById: input.userId },
  });
  return true;
}

export async function setMonthClosed(input: {
  organizationId: string;
  month: MonthKey;
  closed: boolean;
  userId: string;
}): Promise<void> {
  const month = monthKeyToDate(input.month);
  if (input.closed) {
    await prisma.financeMonthClose.upsert({
      where: { organizationId_month: { organizationId: input.organizationId, month } },
      create: { organizationId: input.organizationId, month, closedById: input.userId },
      update: {},
    });
  } else {
    await prisma.financeMonthClose.deleteMany({
      where: { organizationId: input.organizationId, month },
    });
  }
}

/**
 * Create a budget year. Optionally copies budget and forecast of the previous
 * year month by month as starting values (only for categories valid in the new
 * year; existing entries are never overwritten).
 */
export async function createBudgetYear(input: {
  organizationId: string;
  year: number;
  copyPrevious: boolean;
  userId: string;
}): Promise<{ copied: number }> {
  const { organizationId, year, copyPrevious, userId } = input;
  await prisma.financeYear.upsert({
    where: { organizationId_year: { organizationId, year } },
    create: { organizationId, year, createdById: userId },
    update: {},
  });
  if (!copyPrevious) return { copied: 0 };

  const previous = await prisma.financeBudgetEntry.findMany({
    where: {
      organizationId,
      month: yearRange(year - 1),
      category: { archivedAt: null, liquidityOnly: false },
    },
    include: { category: { select: { validFrom: true, validUntil: true } } },
  });
  const data = previous
    .filter((e) => isCategoryActive(e.category, year) && (Number(e.budget) || Number(e.forecast)))
    .map((e) => ({
      organizationId,
      categoryId: e.categoryId,
      month: new Date(Date.UTC(year, e.month.getUTCMonth(), 1)),
      budget: e.budget,
      forecast: e.forecast,
      updatedById: userId,
    }));
  const res = await prisma.financeBudgetEntry.createMany({ data, skipDuplicates: true });
  return { copied: res.count };
}
