"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin, requireMembership } from "@/lib/session";
import { canEditSpace, canViewSpace } from "@/lib/permissions";
import { normalizeSlackWebhookInput } from "@/lib/notifications/slack";

const choreCreateSchema = z.object({
  spaceId: z.string().min(1),
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
});

export async function createChore(formData: FormData) {
  const { session, membership } = await requireMembership();
  const parsed = choreCreateSchema.safeParse({
    spaceId: formData.get("spaceId"),
    title: formData.get("title"),
    description: formData.get("description") || undefined,
  });
  if (!parsed.success) {
    return { error: "Titel fehlt oder ist ungültig." };
  }

  const space = await prisma.space.findUnique({
    where: { id: parsed.data.spaceId },
    include: { access: true },
  });
  if (
    !space ||
    space.slug !== "aemliplan" ||
    !canEditSpace(session.user, space, membership)
  ) {
    return { error: "Kein Zugriff." };
  }

  const maxSort = await prisma.chore.aggregate({
    where: { spaceId: space.id },
    _max: { sortOrder: true },
  });

  await prisma.chore.create({
    data: {
      spaceId: space.id,
      title: parsed.data.title.trim(),
      description: parsed.data.description?.trim() || null,
      status: "todo",
      createdById: session.user.id,
      sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
    },
  });

  revalidatePath(`/spaces/${space.id}`);
  revalidatePath("/home");
  return { ok: true as const };
}

export async function updateChore(formData: FormData) {
  const { session, membership } = await requireMembership();
  const id = String(formData.get("id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "");
  if (!id || title.length < 1) {
    return { error: "Ungültige Ämtli-Daten." };
  }

  const chore = await prisma.chore.findUnique({
    where: { id },
    include: { space: { include: { access: true } } },
  });
  if (!chore || !canEditSpace(session.user, chore.space, membership)) {
    return { error: "Kein Zugriff." };
  }

  await prisma.chore.update({
    where: { id },
    data: {
      title,
      description: description.trim() || null,
    },
  });

  revalidatePath(`/spaces/${chore.spaceId}`);
  revalidatePath(`/projects/${chore.spaceId}`);
  revalidatePath("/home");
  return { ok: true as const };
}

export async function deleteChore(formData: FormData) {
  const { session, membership } = await requireMembership();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Fehlende ID." };

  const chore = await prisma.chore.findUnique({
    where: { id },
    include: { space: { include: { access: true } } },
  });
  if (!chore || !canEditSpace(session.user, chore.space, membership)) {
    return { error: "Kein Zugriff." };
  }

  await prisma.chore.delete({ where: { id } });
  revalidatePath(`/spaces/${chore.spaceId}`);
  revalidatePath(`/projects/${chore.spaceId}`);
  revalidatePath("/home");
  return { ok: true as const };
}

export async function setChoreAssignees(formData: FormData) {
  const { session, membership } = await requireMembership();
  const id = String(formData.get("id") ?? "");
  const assigneeIds = formData.getAll("assigneeIds").map(String).filter(Boolean);
  if (!id) return { error: "Fehlende ID." };

  const chore = await prisma.chore.findUnique({
    where: { id },
    include: { space: { include: { access: true } } },
  });
  if (!chore || !canEditSpace(session.user, chore.space, membership)) {
    return { error: "Kein Zugriff." };
  }

  const members = await prisma.membership.findMany({
    where: {
      organizationId: membership.organizationId,
      archivedAt: null,
      userId: { in: assigneeIds },
    },
    select: { userId: true },
  });
  const validIds = new Set(members.map((m) => m.userId));

  await prisma.$transaction([
    prisma.choreAssignment.deleteMany({ where: { choreId: id } }),
    prisma.choreAssignment.createMany({
      data: [...validIds].map((userId) => ({ choreId: id, userId })),
    }),
  ]);

  revalidatePath(`/spaces/${chore.spaceId}`);
  revalidatePath(`/projects/${chore.spaceId}`);
  revalidatePath("/home");
  return { ok: true as const };
}

const cookingSetSchema = z.object({
  spaceId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  userId: z.string().min(1),
});

export async function setCookingSlot(formData: FormData) {
  const { session, membership } = await requireMembership();
  const parsed = cookingSetSchema.safeParse({
    spaceId: formData.get("spaceId"),
    date: formData.get("date"),
    userId: formData.get("userId"),
  });
  if (!parsed.success) {
    return { error: "Ungültige Kochplan-Daten." };
  }

  const space = await prisma.space.findUnique({
    where: { id: parsed.data.spaceId },
    include: { access: true },
  });
  if (
    !space ||
    space.slug !== "kochplan" ||
    !canViewSpace(session.user, space, membership)
  ) {
    return { error: "Kein Zugriff." };
  }

  const targetMembership = await prisma.membership.findUnique({
    where: {
      organizationId_userId: {
        organizationId: membership.organizationId,
        userId: parsed.data.userId,
      },
    },
  });
  if (!targetMembership) {
    return { error: "Person ist nicht im Team." };
  }

  const { isCookingWeekday } = await import("@/lib/cooking");
  const date = new Date(`${parsed.data.date}T12:00:00.000Z`);
  if (!isCookingWeekday(date)) {
    return { error: "Kochtage sind nur Dienstag bis Freitag." };
  }

  await prisma.cookingSlot.upsert({
    where: {
      spaceId_date: {
        spaceId: space.id,
        date,
      },
    },
    create: {
      spaceId: space.id,
      date,
      userId: parsed.data.userId,
      assignedById: session.user.id,
    },
    update: {
      userId: parsed.data.userId,
      assignedById: session.user.id,
    },
  });

  revalidatePath(`/spaces/${space.id}`);
  revalidatePath("/home");
  return { ok: true as const };
}

export async function clearCookingSlot(formData: FormData) {
  const { session, membership } = await requireMembership();
  const spaceId = String(formData.get("spaceId") ?? "");
  const dateStr = String(formData.get("date") ?? "");
  if (!spaceId || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return { error: "Ungültige Daten." };
  }

  const space = await prisma.space.findUnique({
    where: { id: spaceId },
    include: { access: true },
  });
  if (
    !space ||
    space.slug !== "kochplan" ||
    !canViewSpace(session.user, space, membership)
  ) {
    return { error: "Kein Zugriff." };
  }

  const date = new Date(`${dateStr}T12:00:00.000Z`);
  await prisma.cookingSlot.deleteMany({
    where: { spaceId: space.id, date },
  });

  revalidatePath(`/spaces/${space.id}`);
  revalidatePath("/home");
  return { ok: true as const };
}

export async function updateSlackCookingNotificationSettings(
  formData: FormData,
) {
  const { membership } = await requireAdmin();
  const weekly =
    formData.get("slackCookingWeeklyEnabled") === "on" ||
    formData.get("slackCookingWeeklyEnabled") === "true";
  const monthly =
    formData.get("slackCookingMonthlyEnabled") === "on" ||
    formData.get("slackCookingMonthlyEnabled") === "true";

  const weeklyWebhook = normalizeSlackWebhookInput(
    String(formData.get("slackCookingWeeklyWebhookUrl") ?? ""),
  );
  if (!weeklyWebhook.ok) return { error: weeklyWebhook.error };
  const monthlyWebhook = normalizeSlackWebhookInput(
    String(formData.get("slackCookingMonthlyWebhookUrl") ?? ""),
  );
  if (!monthlyWebhook.ok) return { error: monthlyWebhook.error };

  await prisma.organization.update({
    where: { id: membership.organizationId },
    data: {
      slackCookingWeeklyEnabled: weekly,
      slackCookingMonthlyEnabled: monthly,
      slackCookingWeeklyWebhookUrl: weeklyWebhook.value,
      slackCookingMonthlyWebhookUrl: monthlyWebhook.value,
    },
  });

  revalidatePath("/settings/notifications");
  return { ok: true as const };
}
