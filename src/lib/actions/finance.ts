"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createBudgetYear,
  listCellBookings,
  setBudgetValue,
  setMonthClosed,
  type CellBooking,
} from "@/lib/finance/budget";
import {
  CategoryError,
  createCategory,
  moveCategory,
  updateCategory,
} from "@/lib/finance/categories";
import {
  CompanyError,
  deleteCompany,
  mergeCompanies,
  resolveCompany,
  updateCompany,
  type CompanyInput,
} from "@/lib/finance/companies";
import {
  createBooking,
  createManualDeal,
  deleteBooking,
  deleteDeal,
  markDealReviewed,
  rotateWebhookToken,
  saveDealSplit,
  setDealStatus,
  updateBooking,
  updateDealMeta,
  type BookingInput,
  type SplitRow,
} from "@/lib/finance/deals";
import { isMonthKey, roundCents, type MonthKey } from "@/lib/finance/shared";
import { requireCapability } from "@/lib/session";

const MAX_ABS_AMOUNT = 1e11;

export async function saveFinanceBudgetCell(input: {
  categoryId: string;
  month: MonthKey;
  field: "budget" | "forecast";
  value: number;
}): Promise<{ error: string } | { ok: true }> {
  const { session, membership } = await requireCapability("finance");
  if (input.field !== "budget" && input.field !== "forecast") {
    return { error: "Ungültiges Feld." };
  }
  if (!isMonthKey(input.month)) return { error: "Ungültiger Monat." };
  if (!Number.isFinite(input.value) || Math.abs(input.value) >= MAX_ABS_AMOUNT) {
    return { error: "Ungültiger Betrag." };
  }

  const ok = await setBudgetValue({
    organizationId: membership.organizationId,
    categoryId: input.categoryId,
    month: input.month,
    field: input.field,
    value: Math.round(input.value * 100) / 100,
    userId: session.user.id,
  });
  if (!ok) return { error: "Kategorie nicht gefunden." };

  revalidatePath("/finance");
  return { ok: true };
}

export async function toggleFinanceMonthClosed(input: {
  month: MonthKey;
  closed: boolean;
}): Promise<{ error: string } | { ok: true }> {
  const { session, membership } = await requireCapability("finance");
  if (!isMonthKey(input.month)) return { error: "Ungültiger Monat." };
  await setMonthClosed({
    organizationId: membership.organizationId,
    month: input.month,
    closed: input.closed,
    userId: session.user.id,
  });
  revalidatePath("/finance");
  return { ok: true };
}

export async function loadFinanceCellBookings(input: {
  categoryId: string;
  months: MonthKey[];
}): Promise<CellBooking[]> {
  const { membership } = await requireCapability("finance");
  const months = input.months.filter(isMonthKey).slice(0, 24);
  if (months.length === 0) return [];
  return listCellBookings(membership.organizationId, input.categoryId, months);
}

// ─── Deals ────────────────────────────────────────────────────

type ActionResult = { error: string } | { ok: true };

function revalidateFinance(dealId?: string) {
  revalidatePath("/finance");
  revalidatePath("/finance/deals");
  if (dealId) revalidatePath(`/finance/deals/${dealId}`);
}

function validAmount(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && Math.abs(n) < MAX_ABS_AMOUNT;
}

function cleanText(v: unknown, max = 500): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

function cleanUrl(v: unknown): string | null {
  const t = cleanText(v, 1000);
  if (!t) return null;
  return /^https?:\/\//i.test(t) ? t : null;
}

export async function regenerateFinanceWebhookToken(): Promise<{ token: string }> {
  const { membership } = await requireCapability("finance");
  const token = await rotateWebhookToken(membership.organizationId);
  revalidatePath("/finance/deals");
  return { token };
}

export async function createFinanceDeal(formData: FormData): Promise<void> {
  const { membership } = await requireCapability("finance");
  const title = cleanText(formData.get("title"));
  const amount = Number(String(formData.get("totalAmount") ?? "").replace(/[’'\s]/g, "").replace(",", "."));
  if (!title || !validAmount(amount)) {
    redirect("/finance/deals?neu=1&fehler=1");
  }
  const companyId = await resolveCompany(membership.organizationId, {
    id: cleanText(formData.get("companyId"), 100),
    name: cleanText(formData.get("companyName"), 300) ?? "",
  });
  const id = await createManualDeal({
    organizationId: membership.organizationId,
    title,
    companyId,
    totalAmount: roundCents(amount),
    bexioUrl: cleanUrl(formData.get("bexioUrl")),
    responsibleName: cleanText(formData.get("responsibleName"), 200),
  });
  revalidateFinance();
  redirect(`/finance/deals/${id}`);
}

export async function saveFinanceDealSplit(input: {
  dealId: string;
  totalAmount: number;
  rows: SplitRow[];
  acceptDifference: boolean;
}): Promise<ActionResult> {
  const { membership } = await requireCapability("finance");
  if (!Array.isArray(input.rows) || input.rows.length > 120) {
    return { error: "Ungültige Raten." };
  }
  for (const r of input.rows) {
    if (!isMonthKey(r.month)) return { error: "Jede Rate braucht einen Monat." };
    if (!r.categoryId) return { error: "Jede Rate braucht eine Kategorie." };
    if (!validAmount(r.amount)) return { error: "Ungültiger Betrag in einer Rate." };
    if (!cleanText(r.title)) return { error: "Jede Rate braucht einen Titel." };
  }
  const sum = roundCents(input.rows.reduce((s, r) => s + r.amount, 0));
  if (sum !== roundCents(input.totalAmount) && !input.acceptDifference) {
    return { error: "Summe der Raten weicht vom Deal-Betrag ab." };
  }

  try {
    await saveDealSplit({
      organizationId: membership.organizationId,
      dealId: input.dealId,
      rows: input.rows.map((r) => ({
        id: r.id,
        month: r.month,
        categoryId: r.categoryId,
        amount: roundCents(r.amount),
        title: cleanText(r.title)!,
      })),
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Speichern fehlgeschlagen." };
  }
  revalidateFinance(input.dealId);
  return { ok: true };
}

export async function setFinanceDealStatus(input: {
  dealId: string;
  status: "open" | "ignored";
}): Promise<ActionResult> {
  const { membership } = await requireCapability("finance");
  if (input.status !== "open" && input.status !== "ignored") return { error: "Ungültiger Status." };
  const ok = await setDealStatus(membership.organizationId, input.dealId, input.status);
  if (!ok) return { error: "Nur Deals ohne Raten können ignoriert oder geöffnet werden." };
  revalidateFinance(input.dealId);
  return { ok: true };
}

export async function markFinanceDealReviewed(dealId: string): Promise<ActionResult> {
  const { membership } = await requireCapability("finance");
  await markDealReviewed(membership.organizationId, dealId);
  revalidateFinance(dealId);
  return { ok: true };
}

export async function updateFinanceDealMeta(input: {
  dealId: string;
  title: string;
  company: CompanyInput;
  totalAmount: number;
  bexioUrl: string;
}): Promise<ActionResult> {
  const { membership } = await requireCapability("finance");
  const title = cleanText(input.title);
  if (!title) return { error: "Titel fehlt." };
  if (!validAmount(input.totalAmount)) return { error: "Ungültiger Betrag." };
  let companyId: string | null;
  try {
    companyId = await resolveCompany(membership.organizationId, input.company);
  } catch (e) {
    if (e instanceof CompanyError) return { error: e.message };
    throw e;
  }
  const ok = await updateDealMeta({
    organizationId: membership.organizationId,
    dealId: input.dealId,
    title,
    companyId,
    totalAmount: roundCents(input.totalAmount),
    bexioUrl: cleanUrl(input.bexioUrl),
  });
  if (!ok) return { error: "Deal nicht gefunden." };
  revalidateFinance(input.dealId);
  return { ok: true };
}

export async function deleteFinanceDeal(dealId: string): Promise<void> {
  const { membership } = await requireCapability("finance");
  await deleteDeal(membership.organizationId, dealId);
  revalidateFinance();
  redirect("/finance/deals");
}

// ─── Einzelne Buchungen ──────────────────────────────────────

export async function saveFinanceBooking(input: {
  id: string | null;
  categoryId: string;
  month: MonthKey;
  title: string;
  amount: number;
  company: CompanyInput;
  notes: string;
}): Promise<ActionResult> {
  const { membership } = await requireCapability("finance");
  const title = cleanText(input.title);
  if (!title) return { error: "Titel fehlt." };
  if (!isMonthKey(input.month)) return { error: "Ungültiger Monat." };
  if (!validAmount(input.amount)) return { error: "Ungültiger Betrag." };
  try {
    const data: BookingInput = {
      categoryId: input.categoryId,
      month: input.month,
      title,
      amount: roundCents(input.amount),
      companyId: await resolveCompany(membership.organizationId, input.company),
      notes: cleanText(input.notes, 5000),
    };
    if (input.id) {
      const ok = await updateBooking(membership.organizationId, input.id, data);
      if (!ok) return { error: "Buchung nicht gefunden." };
    } else {
      await createBooking(membership.organizationId, data);
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Speichern fehlgeschlagen." };
  }
  revalidateFinance();
  return { ok: true };
}

export async function deleteFinanceBooking(bookingId: string): Promise<ActionResult> {
  const { membership } = await requireCapability("finance");
  const ok = await deleteBooking(membership.organizationId, bookingId);
  if (!ok) return { error: "Buchung nicht gefunden." };
  revalidateFinance();
  return { ok: true };
}

// ─── Jahre und Kategorien ────────────────────────────────────

function validYear(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 2000 && n <= 2100;
}

export async function createFinanceYear(input: {
  year: number;
  copyPrevious: boolean;
}): Promise<{ error: string } | { ok: true; copied: number }> {
  const { session, membership } = await requireCapability("finance");
  if (!validYear(input.year)) return { error: "Ungültiges Jahr." };
  const { copied } = await createBudgetYear({
    organizationId: membership.organizationId,
    year: input.year,
    copyPrevious: input.copyPrevious === true,
    userId: session.user.id,
  });
  revalidatePath("/finance");
  return { ok: true, copied };
}

async function categoryAction(run: () => Promise<void>): Promise<ActionResult> {
  try {
    await run();
  } catch (e) {
    if (e instanceof CategoryError) return { error: e.message };
    throw e;
  }
  revalidatePath("/finance");
  revalidatePath("/finance/kategorien");
  revalidatePath("/finance/deals", "layout");
  return { ok: true };
}

function optionalYear(v: unknown): number | null {
  return v === null || v === undefined || v === "" ? null : Number(v);
}

export async function createFinanceCategory(input: {
  name: string;
  kind: "income" | "expense";
  group: string;
  validFrom: number | null;
}): Promise<ActionResult> {
  const { membership } = await requireCapability("finance");
  const name = cleanText(input.name, 200);
  if (!name) return { error: "Name fehlt." };
  if (input.kind !== "income" && input.kind !== "expense") return { error: "Ungültige Art." };
  return categoryAction(() =>
    createCategory({
      organizationId: membership.organizationId,
      name,
      kind: input.kind,
      group: cleanText(input.group, 200),
      validFrom: optionalYear(input.validFrom),
    }),
  );
}

export async function updateFinanceCategory(input: {
  id: string;
  name?: string;
  group?: string;
  liquidityOnly?: boolean;
  validFrom?: number | null;
  validUntil?: number | null;
  archived?: boolean;
}): Promise<ActionResult> {
  const { membership } = await requireCapability("finance");
  const patch: Parameters<typeof updateCategory>[2] = {};
  if (input.name !== undefined) {
    const name = cleanText(input.name, 200);
    if (!name) return { error: "Name fehlt." };
    patch.name = name;
  }
  if (input.group !== undefined) patch.group = cleanText(input.group, 200);
  if (input.liquidityOnly !== undefined) patch.liquidityOnly = input.liquidityOnly === true;
  if (input.validFrom !== undefined) patch.validFrom = optionalYear(input.validFrom);
  if (input.validUntil !== undefined) patch.validUntil = optionalYear(input.validUntil);
  if (input.archived !== undefined) patch.archived = input.archived === true;
  return categoryAction(() => updateCategory(membership.organizationId, input.id, patch));
}

export async function moveFinanceCategory(input: {
  id: string;
  direction: -1 | 1;
}): Promise<ActionResult> {
  const { membership } = await requireCapability("finance");
  if (input.direction !== -1 && input.direction !== 1) return { error: "Ungültige Richtung." };
  return categoryAction(() => moveCategory(membership.organizationId, input.id, input.direction));
}

// ─── Organisationen ──────────────────────────────────────────

async function companyAction(run: () => Promise<void>): Promise<ActionResult> {
  try {
    await run();
  } catch (e) {
    if (e instanceof CompanyError) return { error: e.message };
    throw e;
  }
  revalidatePath("/finance", "layout");
  return { ok: true };
}

export async function updateFinanceCompany(input: {
  id: string;
  name?: string;
  notes?: string;
}): Promise<ActionResult> {
  const { membership } = await requireCapability("finance");
  return companyAction(() =>
    updateCompany(membership.organizationId, input.id, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.notes !== undefined ? { notes: cleanText(input.notes, 5000) } : {}),
    }),
  );
}

export async function mergeFinanceCompanies(input: {
  sourceId: string;
  targetId: string;
}): Promise<ActionResult> {
  const { membership } = await requireCapability("finance");
  return companyAction(() =>
    mergeCompanies(membership.organizationId, input.sourceId, input.targetId),
  );
}

export async function deleteFinanceCompany(id: string): Promise<ActionResult> {
  const { membership } = await requireCapability("finance");
  return companyAction(() => deleteCompany(membership.organizationId, id));
}
