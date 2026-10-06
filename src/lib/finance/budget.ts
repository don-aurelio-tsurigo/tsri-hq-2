import { prisma } from "@/lib/db";
import {
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

async function availableYears(organizationId: string): Promise<number[]> {
  const rows = await prisma.$queryRaw<{ year: number }[]>`
    SELECT DISTINCT EXTRACT(YEAR FROM "month")::int AS year
    FROM finance_budget_entry WHERE "organizationId" = ${organizationId}
    UNION
    SELECT DISTINCT EXTRACT(YEAR FROM "month")::int AS year
    FROM finance_booking WHERE "organizationId" = ${organizationId}
  `;
  return rows.map((r) => r.year);
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
      select: { id: true, name: true, kind: true, group: true },
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

  const currentYear = new Date().getFullYear();
  const allYears = new Set([...years, currentYear, year]);

  return {
    year,
    years: [...allYears].sort((a, b) => a - b),
    months: monthsOfYear(year),
    closedMonths: closes.map((c) => monthKeyFromDate(c.month)),
    // income first (enum order), then expense
    categories: categories.map((c) => ({ ...c, kind: c.kind as FinanceKind })),
    cells,
  };
}

export type CellBooking = {
  id: string;
  month: MonthKey;
  title: string;
  amount: number;
  organisation: string | null;
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
    organisation: b.organisation,
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
