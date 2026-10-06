import { randomBytes } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import {
  monthKeyFromDate,
  monthKeyToDate,
  parseLooseAmount,
  parseLooseMonth,
  roundCents,
  type FinanceKind,
  type MonthKey,
} from "./shared";

export type DealStatus = "open" | "split" | "ignored";

// ─── Webhook ───────────────────────────────────────────────────

export type WebhookDeal = {
  externalId: string;
  title: string;
  totalAmount: number;
  organisation: string | null;
  responsibleName: string | null;
  bexioUrl: string | null;
  startMonth: MonthKey | null;
  months: number | null;
  categoryName: string | null;
};

function pick(body: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    const v = body[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

function text(v: unknown, max = 500): string | null {
  if (typeof v === "number") return String(v);
  if (typeof v !== "string") return null;
  const t = v.trim().replace(/\s+/g, " ");
  return t ? t.slice(0, max) : null;
}

/** Normalise a Zapier/Pipedrive JSON body. Field names are matched leniently. */
export function parseWebhookDeal(
  raw: unknown,
): { ok: true; deal: WebhookDeal } | { ok: false; errors: string[] } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, errors: ["Body muss ein JSON-Objekt sein."] };
  }
  const body = raw as Record<string, unknown>;
  const errors: string[] = [];

  const externalId = text(pick(body, ["id", "deal_id", "dealId", "external_id", "externalId"]), 100);
  const title = text(pick(body, ["title", "name", "deal_title"]));
  const totalAmount = parseLooseAmount(pick(body, ["value", "amount", "total", "betrag"]));
  if (!externalId) errors.push("«id» (Deal-ID aus Pipedrive) fehlt.");
  if (!title) errors.push("«title» fehlt.");
  if (totalAmount === null) errors.push("«value» (Betrag) fehlt oder ist keine Zahl.");

  const monthsRaw = pick(body, ["months", "duration_months", "laufzeit_monate", "rates"]);
  const months = monthsRaw === undefined ? null : Number(monthsRaw);

  if (errors.length > 0 || !externalId || !title || totalAmount === null) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    deal: {
      externalId,
      title,
      totalAmount,
      organisation: text(pick(body, ["organisation", "organization", "org_name", "org", "firma"])),
      responsibleName: text(pick(body, ["owner", "owner_name", "responsible", "zustaendig"]), 200),
      bexioUrl: text(pick(body, ["bexio_url", "bexioUrl", "bexio"]), 1000),
      startMonth: parseLooseMonth(pick(body, ["start_month", "startMonth", "start", "start_date"])),
      months: months !== null && Number.isInteger(months) && months >= 1 && months <= 60 ? months : null,
      categoryName: text(pick(body, ["category", "kategorie"]), 200),
    },
  };
}

export async function findOrganizationByWebhookToken(token: string) {
  if (token.length < 20) return null;
  return prisma.organization.findUnique({
    where: { financeWebhookToken: token },
    select: { id: true },
  });
}

export async function upsertDealFromWebhook(
  organizationId: string,
  deal: WebhookDeal,
  payload: Prisma.InputJsonValue,
): Promise<{ id: string; created: boolean; status: DealStatus; changedAfterSplit: boolean }> {
  const where = {
    organizationId_source_externalId: {
      organizationId,
      source: "crm",
      externalId: deal.externalId,
    },
  };
  const existing = await prisma.financeDeal.findUnique({ where });
  const data = {
    title: deal.title,
    totalAmount: deal.totalAmount,
    organisation: deal.organisation,
    responsibleName: deal.responsibleName,
    bexioUrl: deal.bexioUrl,
    payload,
  };

  if (!existing) {
    const created = await prisma.financeDeal.create({
      data: { organizationId, source: "crm", externalId: deal.externalId, ...data },
    });
    return { id: created.id, created: true, status: created.status, changedAfterSplit: false };
  }

  // Already split: keep the rates, but flag relevant changes for review.
  const relevantChange =
    existing.status === "split" &&
    (Number(existing.totalAmount) !== deal.totalAmount || existing.title !== deal.title);
  const updated = await prisma.financeDeal.update({
    where: { id: existing.id },
    data: {
      ...data,
      // Optional fields only overwrite when the webhook actually sends them
      organisation: deal.organisation ?? existing.organisation,
      responsibleName: deal.responsibleName ?? existing.responsibleName,
      bexioUrl: deal.bexioUrl ?? existing.bexioUrl,
      changedAfterSplit: existing.changedAfterSplit || relevantChange,
    },
  });
  return {
    id: updated.id,
    created: false,
    status: updated.status,
    changedAfterSplit: updated.changedAfterSplit,
  };
}

export async function getWebhookToken(organizationId: string): Promise<string | null> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { financeWebhookToken: true },
  });
  return org?.financeWebhookToken ?? null;
}

export async function rotateWebhookToken(organizationId: string): Promise<string> {
  const token = `fin_${randomBytes(24).toString("base64url")}`;
  await prisma.organization.update({
    where: { id: organizationId },
    data: { financeWebhookToken: token },
  });
  return token;
}

// ─── Deal list / detail ───────────────────────────────────────

export type DealListItem = {
  id: string;
  source: string;
  externalId: string | null;
  title: string;
  organisation: string | null;
  responsibleName: string | null;
  totalAmount: number;
  bookedAmount: number;
  bookingCount: number;
  firstMonth: MonthKey | null;
  lastMonth: MonthKey | null;
  status: DealStatus;
  changedAfterSplit: boolean;
  createdAt: string;
};

export async function listDeals(
  organizationId: string,
  filter: DealStatus | "review" | "all",
  query: string,
): Promise<DealListItem[]> {
  const where: Prisma.FinanceDealWhereInput = { organizationId };
  if (filter === "review") where.changedAfterSplit = true;
  else if (filter !== "all") where.status = filter;
  const q = query.trim();
  if (q) {
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { organisation: { contains: q, mode: "insensitive" } },
      { externalId: { equals: q } },
    ];
  }

  const deals = await prisma.financeDeal.findMany({
    where,
    orderBy: [{ createdAt: "desc" }],
    take: 300,
    include: { bookings: { select: { amount: true, month: true } } },
  });

  return deals.map((d) => {
    const months = d.bookings.map((b) => monthKeyFromDate(b.month)).sort();
    return {
      id: d.id,
      source: d.source,
      externalId: d.externalId,
      title: d.title,
      organisation: d.organisation,
      responsibleName: d.responsibleName,
      totalAmount: Number(d.totalAmount),
      bookedAmount: roundCents(d.bookings.reduce((s, b) => s + Number(b.amount), 0)),
      bookingCount: d.bookings.length,
      firstMonth: months[0] ?? null,
      lastMonth: months[months.length - 1] ?? null,
      status: d.status,
      changedAfterSplit: d.changedAfterSplit,
      createdAt: d.createdAt.toISOString(),
    };
  });
}

export type CategoryOption = { id: string; name: string; kind: FinanceKind; group: string | null };

export async function listCategoryOptions(organizationId: string): Promise<CategoryOption[]> {
  const rows = await prisma.financeCategory.findMany({
    where: { organizationId, liquidityOnly: false, archivedAt: null },
    orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, kind: true, group: true },
  });
  return rows.map((r) => ({ ...r, kind: r.kind as FinanceKind }));
}

export type DealDetail = {
  id: string;
  source: string;
  externalId: string | null;
  title: string;
  organisation: string | null;
  responsibleName: string | null;
  bexioUrl: string | null;
  totalAmount: number;
  status: DealStatus;
  changedAfterSplit: boolean;
  createdAt: string;
  updatedAt: string;
  payload: unknown;
  /** Hints from the webhook payload to prefill the split dialog */
  suggestion: { startMonth: MonthKey | null; months: number | null; categoryId: string | null };
  bookings: {
    id: string;
    month: MonthKey;
    categoryId: string;
    title: string;
    amount: number;
    notes: string | null;
  }[];
};

export async function getDealDetail(
  organizationId: string,
  dealId: string,
): Promise<DealDetail | null> {
  const deal = await prisma.financeDeal.findFirst({
    where: { id: dealId, organizationId },
    include: { bookings: { orderBy: [{ month: "asc" }, { createdAt: "asc" }] } },
  });
  if (!deal) return null;

  const parsed = deal.payload ? parseWebhookDeal(deal.payload) : null;
  let categoryId: string | null = null;
  if (parsed?.ok && parsed.deal.categoryName) {
    const category = await prisma.financeCategory.findFirst({
      where: {
        organizationId,
        name: { equals: parsed.deal.categoryName, mode: "insensitive" },
        archivedAt: null,
      },
      select: { id: true },
    });
    categoryId = category?.id ?? null;
  }

  return {
    id: deal.id,
    source: deal.source,
    externalId: deal.externalId,
    title: deal.title,
    organisation: deal.organisation,
    responsibleName: deal.responsibleName,
    bexioUrl: deal.bexioUrl,
    totalAmount: Number(deal.totalAmount),
    status: deal.status,
    changedAfterSplit: deal.changedAfterSplit,
    createdAt: deal.createdAt.toISOString(),
    updatedAt: deal.updatedAt.toISOString(),
    payload: deal.payload,
    suggestion: {
      startMonth: parsed?.ok ? parsed.deal.startMonth : null,
      months: parsed?.ok ? parsed.deal.months : null,
      categoryId,
    },
    bookings: deal.bookings.map((b) => ({
      id: b.id,
      month: monthKeyFromDate(b.month),
      categoryId: b.categoryId,
      title: b.title,
      amount: Number(b.amount),
      notes: b.notes,
    })),
  };
}

// ─── Mutations ────────────────────────────────────────────────

export type SplitRow = {
  /** Existing booking id, or null for a new rate */
  id: string | null;
  month: MonthKey;
  categoryId: string;
  amount: number;
  title: string;
};

async function assertCategories(organizationId: string, ids: string[]) {
  const unique = [...new Set(ids)];
  const found = await prisma.financeCategory.count({
    where: { organizationId, id: { in: unique } },
  });
  if (found !== unique.length) throw new Error("Unbekannte Kategorie.");
}

/**
 * Replace a deal's rates. Existing bookings are updated in place (keeps
 * airtableId etc.), removed ones are deleted, new ones created.
 */
export async function saveDealSplit(input: {
  organizationId: string;
  dealId: string;
  rows: SplitRow[];
}): Promise<void> {
  const { organizationId, dealId, rows } = input;
  const deal = await prisma.financeDeal.findFirst({
    where: { id: dealId, organizationId },
    select: {
      id: true,
      organisation: true,
      responsibleName: true,
      bexioUrl: true,
      bookings: { select: { id: true } },
    },
  });
  if (!deal) throw new Error("Deal nicht gefunden.");
  await assertCategories(organizationId, rows.map((r) => r.categoryId));

  const existingIds = new Set(deal.bookings.map((b) => b.id));
  const keepIds = new Set(rows.flatMap((r) => (r.id && existingIds.has(r.id) ? [r.id] : [])));

  await prisma.$transaction([
    prisma.financeBooking.deleteMany({
      where: { dealId, id: { notIn: [...keepIds] } },
    }),
    ...rows.map((r) => {
      const data = {
        month: monthKeyToDate(r.month),
        categoryId: r.categoryId,
        amount: r.amount,
        title: r.title,
      };
      return r.id && keepIds.has(r.id)
        ? prisma.financeBooking.update({ where: { id: r.id }, data })
        : prisma.financeBooking.create({
            data: {
              ...data,
              organizationId,
              dealId,
              organisation: deal.organisation,
              responsibleName: deal.responsibleName,
              bexioUrl: deal.bexioUrl,
            },
          });
    }),
    prisma.financeDeal.update({
      where: { id: dealId },
      data: { status: rows.length > 0 ? "split" : "open", changedAfterSplit: false },
    }),
  ]);
}

export async function setDealStatus(
  organizationId: string,
  dealId: string,
  status: "open" | "ignored",
): Promise<boolean> {
  const res = await prisma.financeDeal.updateMany({
    where: { id: dealId, organizationId, bookings: { none: {} } },
    data: { status },
  });
  return res.count > 0;
}

export async function markDealReviewed(organizationId: string, dealId: string) {
  await prisma.financeDeal.updateMany({
    where: { id: dealId, organizationId },
    data: { changedAfterSplit: false },
  });
}

export async function updateDealMeta(input: {
  organizationId: string;
  dealId: string;
  title: string;
  organisation: string | null;
  totalAmount: number;
  bexioUrl: string | null;
}) {
  const res = await prisma.financeDeal.updateMany({
    where: { id: input.dealId, organizationId: input.organizationId },
    data: {
      title: input.title,
      organisation: input.organisation,
      totalAmount: input.totalAmount,
      bexioUrl: input.bexioUrl,
    },
  });
  return res.count > 0;
}

export async function createManualDeal(input: {
  organizationId: string;
  title: string;
  organisation: string | null;
  totalAmount: number;
  bexioUrl: string | null;
  responsibleName: string | null;
}): Promise<string> {
  const deal = await prisma.financeDeal.create({
    data: {
      organizationId: input.organizationId,
      source: "manual",
      title: input.title,
      organisation: input.organisation,
      totalAmount: input.totalAmount,
      bexioUrl: input.bexioUrl,
      responsibleName: input.responsibleName,
    },
  });
  return deal.id;
}

/** Deletes the deal and its rates. */
export async function deleteDeal(organizationId: string, dealId: string): Promise<boolean> {
  const deal = await prisma.financeDeal.findFirst({
    where: { id: dealId, organizationId },
    select: { id: true },
  });
  if (!deal) return false;
  await prisma.$transaction([
    prisma.financeBooking.deleteMany({ where: { dealId } }),
    prisma.financeDeal.delete({ where: { id: dealId } }),
  ]);
  return true;
}

// ─── Single bookings (without deal) ───────────────────────────

export type BookingInput = {
  categoryId: string;
  month: MonthKey;
  title: string;
  amount: number;
  organisation: string | null;
  notes: string | null;
};

export async function createBooking(organizationId: string, input: BookingInput) {
  await assertCategories(organizationId, [input.categoryId]);
  await prisma.financeBooking.create({
    data: { organizationId, ...input, month: monthKeyToDate(input.month) },
  });
}

export async function updateBooking(
  organizationId: string,
  bookingId: string,
  input: BookingInput,
): Promise<boolean> {
  await assertCategories(organizationId, [input.categoryId]);
  const res = await prisma.financeBooking.updateMany({
    where: { id: bookingId, organizationId },
    data: { ...input, month: monthKeyToDate(input.month) },
  });
  return res.count > 0;
}

export async function deleteBooking(organizationId: string, bookingId: string): Promise<boolean> {
  const res = await prisma.financeBooking.deleteMany({
    where: { id: bookingId, organizationId },
  });
  return res.count > 0;
}
