import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import {
  companyLooseKey,
  companyNameKey,
  monthKeyFromDate,
  normalizeCompanyName,
  roundCents,
  type MonthKey,
} from "./shared";

export class CompanyError extends Error {}

export type CompanyOption = { id: string; name: string };

/** What the UI sends: an existing company, a new name, or nothing. */
export type CompanyInput = { id: string | null; name: string } | null;

export async function listCompanyOptions(organizationId: string): Promise<CompanyOption[]> {
  return prisma.financeCompany.findMany({
    where: { organizationId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

/**
 * Find a company by Pipedrive ID first, then by normalised name; create it if
 * neither matches. A name match learns the Pipedrive ID for next time.
 */
export async function findOrCreateCompany(
  organizationId: string,
  rawName: string,
  pipedriveId: string | null = null,
): Promise<string> {
  const name = normalizeCompanyName(rawName).slice(0, 300);
  const nameKey = companyNameKey(name);

  if (pipedriveId) {
    const byId = await prisma.financeCompany.findUnique({
      where: { organizationId_pipedriveId: { organizationId, pipedriveId } },
      select: { id: true },
    });
    if (byId) return byId.id;
  }

  const byName = await prisma.financeCompany.findUnique({
    where: { organizationId_nameKey: { organizationId, nameKey } },
    select: { id: true, pipedriveId: true },
  });
  if (byName) {
    if (pipedriveId && !byName.pipedriveId) {
      await prisma.financeCompany.update({ where: { id: byName.id }, data: { pipedriveId } });
    }
    return byName.id;
  }

  try {
    const created = await prisma.financeCompany.create({
      data: { organizationId, name, nameKey, pipedriveId },
      select: { id: true },
    });
    return created.id;
  } catch (e) {
    // Concurrent webhook created it in the meantime
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const again = await prisma.financeCompany.findUnique({
        where: { organizationId_nameKey: { organizationId, nameKey } },
        select: { id: true },
      });
      if (again) return again.id;
    }
    throw e;
  }
}

/** Resolve UI input to a company id (verifying ownership, creating new names). */
export async function resolveCompany(
  organizationId: string,
  input: CompanyInput,
): Promise<string | null> {
  if (!input) return null;
  if (input.id) {
    const found = await prisma.financeCompany.findFirst({
      where: { id: input.id, organizationId },
      select: { id: true },
    });
    if (!found) throw new CompanyError("Organisation nicht gefunden.");
    return found.id;
  }
  const name = normalizeCompanyName(input.name ?? "");
  return name ? findOrCreateCompany(organizationId, name) : null;
}

// ─── Verwaltung ───────────────────────────────────────────────

export type AdminCompany = {
  id: string;
  name: string;
  pipedriveId: string | null;
  notes: string | null;
  dealCount: number;
  bookingCount: number;
  /** Booked amount per year */
  totals: Record<number, number>;
};

export async function listAdminCompanies(organizationId: string): Promise<AdminCompany[]> {
  const [companies, sums] = await Promise.all([
    prisma.financeCompany.findMany({
      where: { organizationId },
      orderBy: { name: "asc" },
      include: { _count: { select: { deals: true, bookings: true } } },
    }),
    prisma.$queryRaw<{ companyId: string; year: number; total: number }[]>`
      SELECT "companyId", EXTRACT(YEAR FROM "month")::int AS year, SUM("amount")::float AS total
      FROM finance_booking
      WHERE "organizationId" = ${organizationId} AND "companyId" IS NOT NULL
      GROUP BY "companyId", year
    `,
  ]);
  const totals = new Map<string, Record<number, number>>();
  for (const s of sums) {
    const t = totals.get(s.companyId) ?? {};
    t[s.year] = roundCents(s.total);
    totals.set(s.companyId, t);
  }
  return companies.map((c) => ({
    id: c.id,
    name: c.name,
    pipedriveId: c.pipedriveId,
    notes: c.notes,
    dealCount: c._count.deals,
    bookingCount: c._count.bookings,
    totals: totals.get(c.id) ?? {},
  }));
}

/** Groups of companies whose names look like the same organisation. */
export function findLikelyDuplicates<T extends { id: string; name: string }>(companies: T[]): T[][] {
  const groups = new Map<string, T[]>();
  for (const c of companies) {
    const key = companyLooseKey(c.name);
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push(c);
    groups.set(key, list);
  }
  return [...groups.values()].filter((g) => g.length > 1);
}

export type CompanyDetail = {
  id: string;
  name: string;
  pipedriveId: string | null;
  notes: string | null;
  deals: {
    id: string;
    title: string;
    totalAmount: number;
    status: string;
    changedAfterSplit: boolean;
    bookingCount: number;
  }[];
  bookings: {
    id: string;
    month: MonthKey;
    title: string;
    amount: number;
    categoryName: string;
    dealId: string | null;
  }[];
};

export async function getCompanyDetail(
  organizationId: string,
  id: string,
): Promise<CompanyDetail | null> {
  const c = await prisma.financeCompany.findFirst({
    where: { id, organizationId },
    include: {
      deals: {
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { bookings: true } } },
      },
      bookings: {
        orderBy: [{ month: "desc" }, { amount: "desc" }],
        include: { category: { select: { name: true } } },
      },
    },
  });
  if (!c) return null;
  return {
    id: c.id,
    name: c.name,
    pipedriveId: c.pipedriveId,
    notes: c.notes,
    deals: c.deals.map((d) => ({
      id: d.id,
      title: d.title,
      totalAmount: Number(d.totalAmount),
      status: d.status,
      changedAfterSplit: d.changedAfterSplit,
      bookingCount: d._count.bookings,
    })),
    bookings: c.bookings.map((b) => ({
      id: b.id,
      month: monthKeyFromDate(b.month),
      title: b.title,
      amount: Number(b.amount),
      categoryName: b.category.name,
      dealId: b.dealId,
    })),
  };
}

export async function updateCompany(
  organizationId: string,
  id: string,
  patch: { name?: string; notes?: string | null },
) {
  const current = await prisma.financeCompany.findFirst({ where: { id, organizationId } });
  if (!current) throw new CompanyError("Organisation nicht gefunden.");
  const data: Prisma.FinanceCompanyUpdateInput = {};
  if (patch.name !== undefined) {
    const name = normalizeCompanyName(patch.name);
    if (!name) throw new CompanyError("Name fehlt.");
    data.name = name;
    data.nameKey = companyNameKey(name);
  }
  if (patch.notes !== undefined) data.notes = patch.notes;
  try {
    await prisma.financeCompany.update({ where: { id }, data });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new CompanyError(
        "Es gibt schon eine Organisation mit diesem Namen – stattdessen zusammenführen.",
      );
    }
    throw e;
  }
}

/** Move all deals and bookings of `sourceId` to `targetId` and delete the source. */
export async function mergeCompanies(organizationId: string, sourceId: string, targetId: string) {
  if (sourceId === targetId) throw new CompanyError("Bitte zwei verschiedene Organisationen wählen.");
  const [source, target] = await Promise.all([
    prisma.financeCompany.findFirst({ where: { id: sourceId, organizationId } }),
    prisma.financeCompany.findFirst({ where: { id: targetId, organizationId } }),
  ]);
  if (!source || !target) throw new CompanyError("Organisation nicht gefunden.");

  const notes = [target.notes, source.notes].filter(Boolean).join("\n\n") || null;
  await prisma.$transaction([
    prisma.financeDeal.updateMany({ where: { companyId: sourceId }, data: { companyId: targetId } }),
    prisma.financeBooking.updateMany({ where: { companyId: sourceId }, data: { companyId: targetId } }),
    prisma.financeCompany.delete({ where: { id: sourceId } }),
    // Keep the Pipedrive ID if only the merged-away entry knew it
    prisma.financeCompany.update({
      where: { id: targetId },
      data: { notes, ...(target.pipedriveId ? {} : { pipedriveId: source.pipedriveId }) },
    }),
  ]);
}

/** Only possible when nothing references the company anymore. */
export async function deleteCompany(organizationId: string, id: string) {
  const c = await prisma.financeCompany.findFirst({
    where: { id, organizationId },
    include: { _count: { select: { deals: true, bookings: true } } },
  });
  if (!c) throw new CompanyError("Organisation nicht gefunden.");
  if (c._count.deals || c._count.bookings) {
    throw new CompanyError("Hat noch Deals oder Buchungen – stattdessen zusammenführen.");
  }
  await prisma.financeCompany.delete({ where: { id } });
}
