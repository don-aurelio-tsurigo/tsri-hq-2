"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  assignLineCategory,
  deleteChannelRule,
  deletePayout,
  ingestExport,
  upsertChannelRule,
} from "@/lib/payrexx";
import { requireMembership } from "@/lib/session";

function revalidatePayrexx(payoutId?: string) {
  revalidatePath("/payrexx");
  revalidatePath("/payrexx/review");
  revalidatePath("/payrexx/rules");
  if (payoutId) revalidatePath(`/payrexx/${payoutId}`);
}

/** Called from client; may return `{ error }` or redirect on success. */
export async function uploadPayrexxExport(
  formData: FormData,
): Promise<{ error: string } | void> {
  const { membership } = await requireMembership();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Bitte eine XLSX- oder CSV-Datei wählen." };
  }
  const name = file.name || "export.xlsx";
  const lower = name.toLowerCase();
  if (
    !lower.endsWith(".xlsx") &&
    !lower.endsWith(".xlsm") &&
    !lower.endsWith(".csv")
  ) {
    return { error: "Nur .xlsx oder .csv werden unterstützt." };
  }

  let created: { id: string; uuid: string };
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    created = await ingestExport(membership.organizationId, buffer, name);
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Import fehlgeschlagen.",
    };
  }

  revalidatePayrexx(created.id);
  redirect(`/payrexx/${created.id}`);
}

/** Called from client; redirects on success. */
export async function assignPayrexxLine(formData: FormData): Promise<void> {
  const { membership } = await requireMembership();
  const lineId = String(formData.get("lineId") ?? "");
  const categoryKey = String(formData.get("categoryKey") ?? "");
  const rememberChannel = formData.get("rememberChannel") === "1";
  const nextPath = String(formData.get("next") ?? "/payrexx/review");

  if (!lineId || !categoryKey) return;

  const result = await assignLineCategory({
    organizationId: membership.organizationId,
    lineId,
    categoryKey,
    rememberChannel,
  });
  if (!result) return;

  revalidatePayrexx(result.payoutId);
  redirect(nextPath.startsWith("/payrexx") ? nextPath : "/payrexx/review");
}

export async function deletePayrexxPayout(formData: FormData): Promise<void> {
  const { membership } = await requireMembership();
  const payoutId = String(formData.get("payoutId") ?? "");
  if (payoutId) {
    await deletePayout(membership.organizationId, payoutId);
  }
  revalidatePayrexx();
  redirect("/payrexx");
}

export async function savePayrexxChannelRule(formData: FormData): Promise<void> {
  const { membership } = await requireMembership();
  const channel = String(formData.get("channel") ?? "").trim();
  const categoryKey = String(formData.get("categoryKey") ?? "");
  if (channel && categoryKey) {
    await upsertChannelRule(membership.organizationId, channel, categoryKey);
  }
  revalidatePayrexx();
  redirect("/payrexx/rules");
}

export async function removePayrexxChannelRule(
  formData: FormData,
): Promise<void> {
  const { membership } = await requireMembership();
  const ruleId = String(formData.get("ruleId") ?? "");
  if (ruleId) {
    await deleteChannelRule(membership.organizationId, ruleId);
  }
  revalidatePayrexx();
  redirect("/payrexx/rules");
}
