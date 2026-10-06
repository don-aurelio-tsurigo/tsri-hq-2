"use server";

import { revalidatePath } from "next/cache";
import {
  listCellBookings,
  setBudgetValue,
  setMonthClosed,
  type CellBooking,
} from "@/lib/finance/budget";
import { isMonthKey, type MonthKey } from "@/lib/finance/shared";
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
