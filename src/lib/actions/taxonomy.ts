"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";

// ─── Eigenleistungs-Rubriken ───────────────────────────────────

const rubrikSchema = z.object({
  name: z.string().min(1).max(80),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
});

async function revalidateRedaktion(organizationId: string) {
  const space = await prisma.space.findFirst({
    where: { organizationId, slug: "redaktion" },
    select: { id: true },
  });
  if (space) revalidatePath(`/spaces/${space.id}`);
  revalidatePath("/programm");
}

export async function createEigenleistungRubrik(formData: FormData) {
  const { membership } = await requireAdmin();
  const parsed = rubrikSchema.safeParse({
    name: formData.get("name"),
    color: formData.get("color") || undefined,
  });
  if (!parsed.success) {
    return { error: "Name (und ggf. Farbe #RRGGBB) prüfen." };
  }

  const maxSort = await prisma.eigenleistungRubrik.aggregate({
    where: { organizationId: membership.organizationId },
    _max: { sortOrder: true },
  });

  try {
    await prisma.eigenleistungRubrik.create({
      data: {
        organizationId: membership.organizationId,
        name: parsed.data.name.trim(),
        color: parsed.data.color ?? "#e5e7eb",
        sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
      },
    });
  } catch {
    return { error: "Rubrik existiert bereits oder konnte nicht erstellt werden." };
  }

  await revalidateRedaktion(membership.organizationId);
  return { ok: true as const };
}

export async function updateEigenleistungRubrik(formData: FormData) {
  const { membership } = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Fehlende ID." };

  const parsed = rubrikSchema.extend({
    active: z.enum(["true", "false"]).optional(),
  }).safeParse({
    name: formData.get("name"),
    color: formData.get("color") || undefined,
    active: formData.has("active")
      ? String(formData.get("active"))
      : undefined,
  });
  if (!parsed.success) {
    return { error: "Name (und ggf. Farbe #RRGGBB) prüfen." };
  }

  const existing = await prisma.eigenleistungRubrik.findFirst({
    where: { id, organizationId: membership.organizationId },
  });
  if (!existing) return { error: "Rubrik nicht gefunden." };

  try {
    await prisma.eigenleistungRubrik.update({
      where: { id },
      data: {
        name: parsed.data.name.trim(),
        ...(parsed.data.color ? { color: parsed.data.color } : {}),
        ...(parsed.data.active !== undefined
          ? { active: parsed.data.active === "true" }
          : {}),
      },
    });
  } catch {
    return { error: "Speichern fehlgeschlagen (Name evtl. doppelt)." };
  }

  await revalidateRedaktion(membership.organizationId);
  return { ok: true as const };
}

export async function deleteEigenleistungRubrik(formData: FormData) {
  const { membership } = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Fehlende ID." };

  const existing = await prisma.eigenleistungRubrik.findFirst({
    where: { id, organizationId: membership.organizationId },
  });
  if (!existing) return { error: "Rubrik nicht gefunden." };

  await prisma.eigenleistungRubrik.delete({ where: { id } });
  await revalidateRedaktion(membership.organizationId);
  return { ok: true as const };
}

// ─── Artikel-Kategorien ────────────────────────────────────────

export async function createArticleCategory(formData: FormData) {
  const { membership } = await requireAdmin();
  const parsed = rubrikSchema.safeParse({
    name: formData.get("name"),
    color: formData.get("color") || undefined,
  });
  if (!parsed.success) {
    return { error: "Name (und ggf. Farbe #RRGGBB) prüfen." };
  }

  const maxSort = await prisma.articleCategory.aggregate({
    where: { organizationId: membership.organizationId },
    _max: { sortOrder: true },
  });

  try {
    await prisma.articleCategory.create({
      data: {
        organizationId: membership.organizationId,
        name: parsed.data.name.trim(),
        color: parsed.data.color ?? "#e5e7eb",
        sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
      },
    });
  } catch {
    return {
      error: "Kategorie existiert bereits oder konnte nicht erstellt werden.",
    };
  }

  await revalidateRedaktion(membership.organizationId);
  return { ok: true as const };
}

export async function updateArticleCategory(formData: FormData) {
  const { membership } = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Fehlende ID." };

  const parsed = rubrikSchema
    .extend({
      active: z.enum(["true", "false"]).optional(),
    })
    .safeParse({
      name: formData.get("name"),
      color: formData.get("color") || undefined,
      active: formData.has("active")
        ? String(formData.get("active"))
        : undefined,
    });
  if (!parsed.success) {
    return { error: "Name (und ggf. Farbe #RRGGBB) prüfen." };
  }

  const existing = await prisma.articleCategory.findFirst({
    where: { id, organizationId: membership.organizationId },
  });
  if (!existing) return { error: "Kategorie nicht gefunden." };

  try {
    await prisma.articleCategory.update({
      where: { id },
      data: {
        name: parsed.data.name.trim(),
        ...(parsed.data.color ? { color: parsed.data.color } : {}),
        ...(parsed.data.active !== undefined
          ? { active: parsed.data.active === "true" }
          : {}),
      },
    });
  } catch {
    return { error: "Speichern fehlgeschlagen (Name evtl. doppelt)." };
  }

  await revalidateRedaktion(membership.organizationId);
  return { ok: true as const };
}

export async function deleteArticleCategory(formData: FormData) {
  const { membership } = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Fehlende ID." };

  const existing = await prisma.articleCategory.findFirst({
    where: { id, organizationId: membership.organizationId },
  });
  if (!existing) return { error: "Kategorie nicht gefunden." };

  await prisma.articleCategory.delete({ where: { id } });
  await revalidateRedaktion(membership.organizationId);
  return { ok: true as const };
}
