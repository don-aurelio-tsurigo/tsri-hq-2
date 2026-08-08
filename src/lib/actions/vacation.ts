"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin, requireMembership } from "@/lib/session";

// ─── Ferienplan ────────────────────────────────────────────────

const vacationCreateSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().max(500).optional(),
});

export async function createVacationRequest(formData: FormData) {
  const { session, membership } = await requireMembership();
  const parsed = vacationCreateSchema.safeParse({
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) {
    return { error: "Bitte Von- und Bis-Datum prüfen." };
  }
  if (parsed.data.endDate < parsed.data.startDate) {
    return { error: "Bis-Datum muss am oder nach dem Von-Datum liegen." };
  }

  await prisma.vacationRequest.create({
    data: {
      organizationId: membership.organizationId,
      userId: session.user.id,
      startDate: new Date(`${parsed.data.startDate}T12:00:00.000Z`),
      endDate: new Date(`${parsed.data.endDate}T12:00:00.000Z`),
      note: parsed.data.note?.trim() || null,
      status: "pending",
    },
  });

  await revalidateVacationPaths(membership.organizationId);
  return { ok: true as const };
}

const vacationUpdateSchema = vacationCreateSchema.extend({
  id: z.string().min(1),
});

/** Owner edits own vacation; always resets to pending for admin re-approval. */
export async function updateVacationRequest(formData: FormData) {
  const { session, membership } = await requireMembership();
  const parsed = vacationUpdateSchema.safeParse({
    id: formData.get("id"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) {
    return { error: "Bitte Eintrag und Daten prüfen." };
  }
  if (parsed.data.endDate < parsed.data.startDate) {
    return { error: "Bis-Datum muss am oder nach dem Von-Datum liegen." };
  }

  const request = await prisma.vacationRequest.findFirst({
    where: {
      id: parsed.data.id,
      organizationId: membership.organizationId,
    },
  });
  if (!request) return { error: "Anfrage nicht gefunden." };
  if (request.userId !== session.user.id) {
    return { error: "Du kannst nur eigene Ferien bearbeiten." };
  }

  await prisma.vacationRequest.update({
    where: { id: request.id },
    data: {
      startDate: new Date(`${parsed.data.startDate}T12:00:00.000Z`),
      endDate: new Date(`${parsed.data.endDate}T12:00:00.000Z`),
      note: parsed.data.note?.trim() || null,
      status: "pending",
      reviewedById: null,
      reviewedAt: null,
    },
  });

  await revalidateVacationPaths(membership.organizationId);
  return { ok: true as const };
}

export async function reviewVacationRequest(formData: FormData) {
  const { session, membership } = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  if (!id || (decision !== "approved" && decision !== "rejected")) {
    return { error: "Ungültige Entscheidung." };
  }

  const request = await prisma.vacationRequest.findFirst({
    where: {
      id,
      organizationId: membership.organizationId,
      status: "pending",
    },
  });
  if (!request) return { error: "Anfrage nicht gefunden oder bereits bearbeitet." };

  await prisma.vacationRequest.update({
    where: { id: request.id },
    data: {
      status: decision,
      reviewedById: session.user.id,
      reviewedAt: new Date(),
    },
  });

  await revalidateVacationPaths(membership.organizationId);
  return { ok: true as const };
}

export async function cancelVacationRequest(formData: FormData) {
  const { session, membership } = await requireMembership();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Fehlende ID." };

  const request = await prisma.vacationRequest.findFirst({
    where: {
      id,
      organizationId: membership.organizationId,
    },
  });
  if (!request) return { error: "Anfrage nicht gefunden." };

  const isAdmin = membership.role === "admin";
  const isOwner = request.userId === session.user.id;
  if (!isAdmin && !isOwner) return { error: "Keine Berechtigung." };
  if (!isAdmin && request.status !== "pending") {
    return { error: "Nur offene Anfragen können zurückgezogen werden." };
  }

  await prisma.vacationRequest.delete({ where: { id: request.id } });

  await revalidateVacationPaths(membership.organizationId);
  return { ok: true as const };
}

async function revalidateVacationPaths(organizationId: string) {
  revalidatePath("/home");
  const space = await prisma.space.findFirst({
    where: { organizationId, slug: "ferienplan" },
    select: { id: true },
  });
  if (space) revalidatePath(`/spaces/${space.id}`);
}
