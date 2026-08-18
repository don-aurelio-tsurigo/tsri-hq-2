"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireMembership } from "@/lib/session";
import { canEditSpace, canViewSpace } from "@/lib/permissions";

const projectCreateSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(5000).optional(),
  templateId: z
    .string()
    .trim()
    .transform((v) => (v.length === 0 ? undefined : v))
    .optional(),
  eventAt: z
    .string()
    .trim()
    .transform((v) => (v.length === 0 ? undefined : v))
    .optional(),
  venue: z
    .string()
    .trim()
    .transform((v) => (v.length === 0 ? undefined : v))
    .optional(),
  kind: z
    .string()
    .optional()
    .transform((v) => (v === "event" || v === "vorhaben" ? v : undefined)),
});

function revalidateProjectNav(projectId: string) {
  revalidatePath("/projects");
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/tasks");
  revalidatePath("/home");
  revalidatePath("/", "layout");
}

export async function createProject(formData: FormData) {
  const { session, membership } = await requireMembership();
  const parsed = projectCreateSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    templateId: formData.get("templateId") || undefined,
    eventAt: formData.get("eventAt") || undefined,
    venue: formData.get("venue") || undefined,
    kind: formData.get("kind") || undefined,
  });
  if (!parsed.success) {
    return { error: "Projektname fehlt oder ist ungültig (min. 2 Zeichen)." };
  }

  const kind = parsed.data.kind;
  if (kind === "event" && !parsed.data.eventAt) {
    return { error: "Für ein Event bitte ein Datum setzen." };
  }

  if (parsed.data.eventAt && !/^\d{4}-\d{2}-\d{2}$/.test(parsed.data.eventAt)) {
    return { error: "Ungültiges Event-Datum." };
  }

  const { uniqueProjectSlug, copyProjectStructure } =
    await import("@/lib/projects");

  let template: {
    id: string;
    description: string | null;
  } | null = null;
  if (parsed.data.templateId) {
    template = await prisma.space.findFirst({
      where: {
        id: parsed.data.templateId,
        organizationId: membership.organizationId,
        type: "project",
        isTemplate: true,
        archivedAt: null,
      },
      select: { id: true, description: true },
    });
    if (!template) return { error: "Vorlage nicht gefunden." };
  }

  const slug = await uniqueProjectSlug(
    membership.organizationId,
    parsed.data.name,
  );

  const description =
    parsed.data.description?.trim() ||
    template?.description?.trim() ||
    null;

  const eventAt =
    kind === "vorhaben"
      ? null
      : parsed.data.eventAt
        ? new Date(`${parsed.data.eventAt}T12:00:00.000Z`)
        : null;

  const venue =
    kind === "vorhaben" ? null : parsed.data.venue?.trim() || null;

  const project = await prisma.space.create({
    data: {
      organizationId: membership.organizationId,
      type: "project",
      name: parsed.data.name.trim(),
      slug,
      description,
      visibility: "team",
      ownerUserId: session.user.id,
      isTemplate: false,
      eventAt,
      venue,
    },
  });

  if (template) {
    await copyProjectStructure(template.id, project.id, session.user.id, {
      eventAt,
    });
  }

  revalidatePath("/tasks");
  revalidatePath("/projects");
  redirect(`/projects/${project.id}`);
}

export async function archiveProject(formData: FormData) {
  const { session, membership } = await requireMembership();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Fehlende ID." };

  const project = await prisma.space.findFirst({
    where: {
      id,
      organizationId: membership.organizationId,
      type: "project",
      isTemplate: false,
    },
    include: { access: true },
  });
  if (!project || !canEditSpace(session.user, project, membership)) {
    return { error: "Kein Zugriff." };
  }

  await prisma.space.update({
    where: { id: project.id },
    data: { archivedAt: new Date(), navPinned: false },
  });

  revalidateProjectNav(project.id);
  return { ok: true as const };
}

export async function unarchiveProject(formData: FormData) {
  const { session, membership } = await requireMembership();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Fehlende ID." };

  const project = await prisma.space.findFirst({
    where: {
      id,
      organizationId: membership.organizationId,
      type: "project",
      isTemplate: false,
    },
    include: { access: true },
  });
  if (!project || !canEditSpace(session.user, project, membership)) {
    return { error: "Kein Zugriff." };
  }

  await prisma.space.update({
    where: { id: project.id },
    data: { archivedAt: null },
  });

  revalidateProjectNav(project.id);
  return { ok: true as const };
}

const MAX_NAV_PINS = 8;

export async function toggleProjectNavPin(formData: FormData) {
  const { session, membership } = await requireMembership();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Fehlende ID." };

  const project = await prisma.space.findFirst({
    where: {
      id,
      organizationId: membership.organizationId,
      type: "project",
      isTemplate: false,
    },
    include: { access: true },
  });
  if (!project || !canEditSpace(session.user, project, membership)) {
    return { error: "Kein Zugriff." };
  }
  if (project.archivedAt) {
    return { error: "Archivierte Projekte können nicht angepinnt werden." };
  }

  if (!project.navPinned) {
    const pinnedCount = await prisma.space.count({
      where: {
        organizationId: membership.organizationId,
        type: "project",
        isTemplate: false,
        archivedAt: null,
        navPinned: true,
      },
    });
    if (pinnedCount >= MAX_NAV_PINS) {
      return { error: "Maximal 8 Pins. Bitte ein anderes Projekt lösen." };
    }
  }

  await prisma.space.update({
    where: { id: project.id },
    data: { navPinned: !project.navPinned },
  });

  revalidateProjectNav(project.id);
  return { ok: true as const };
}

const saveAsTemplateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(2).max(120).optional(),
});

/** Clone a project (groups + tasks + relative dues) into a new template project. */
export async function saveProjectAsTemplate(formData: FormData) {
  const { session, membership } = await requireMembership();
  const parsed = saveAsTemplateSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name") || undefined,
  });
  if (!parsed.success) return { error: "Ungültige Angabe." };

  const source = await prisma.space.findFirst({
    where: {
      id: parsed.data.id,
      organizationId: membership.organizationId,
      type: "project",
      isTemplate: false,
    },
    include: { access: true },
  });
  if (!source || !canViewSpace(session.user, source, membership)) {
    return { error: "Projekt nicht gefunden." };
  }
  if (!canEditSpace(session.user, source, membership)) {
    return { error: "Keine Berechtigung." };
  }

  const { uniqueProjectSlug, copyProjectStructure } =
    await import("@/lib/projects");
  const templateName =
    parsed.data.name?.trim() || `${source.name} (Vorlage)`;
  const slug = await uniqueProjectSlug(
    membership.organizationId,
    templateName,
  );

  const template = await prisma.space.create({
    data: {
      organizationId: membership.organizationId,
      type: "project",
      name: templateName,
      slug,
      description: source.description,
      visibility: "team",
      ownerUserId: session.user.id,
      isTemplate: true,
      // Templates keep no concrete event date; offsets live on tasks
      eventAt: null,
      venue: null,
    },
  });

  await copyProjectStructure(source.id, template.id, session.user.id);

  revalidatePath("/projects");
  revalidatePath(`/projects/${source.id}`);
  revalidatePath(`/projects/${template.id}`);
  return { ok: true as const, id: template.id };
}

const projectEventMetaSchema = z.object({
  spaceId: z.string().min(1),
  eventAt: z.string().optional(),
  venue: z.string().max(200).optional(),
});

export async function updateProjectEventMeta(formData: FormData) {
  const { session, membership } = await requireMembership();
  const parsed = projectEventMetaSchema.safeParse({
    spaceId: formData.get("spaceId"),
    eventAt: formData.has("eventAt")
      ? String(formData.get("eventAt") ?? "")
      : undefined,
    venue: formData.has("venue")
      ? String(formData.get("venue") ?? "")
      : undefined,
  });
  if (!parsed.success) {
    return { error: "Ungültige Event-Daten." };
  }

  const space = await prisma.space.findUnique({
    where: { id: parsed.data.spaceId },
    include: { access: true },
  });
  if (
    !space ||
    space.type !== "project" ||
    !canEditSpace(session.user, space, membership)
  ) {
    return { error: "Kein Zugriff." };
  }

  let eventAt: Date | null | undefined;
  if (parsed.data.eventAt !== undefined) {
    const raw = parsed.data.eventAt.trim();
    if (raw === "") {
      eventAt = null;
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      return { error: "Ungültiges Event-Datum." };
    } else {
      eventAt = new Date(`${raw}T12:00:00.000Z`);
    }
  }

  const data: {
    eventAt?: Date | null;
    venue?: string | null;
  } = {};

  if (eventAt !== undefined) data.eventAt = eventAt;
  if (parsed.data.venue !== undefined) {
    data.venue = parsed.data.venue.trim() || null;
  }

  await prisma.space.update({
    where: { id: space.id },
    data,
  });

  if (eventAt !== undefined) {
    const { applyDueOffsetsFromEvent } = await import("@/lib/projects");
    await applyDueOffsetsFromEvent(space.id, eventAt);
  }

  revalidatePath("/projects");
  revalidatePath(`/projects/${space.id}`);
  revalidatePath("/tasks");
  revalidatePath("/home");
  return { ok: true as const };
}

export async function deleteProjectTemplate(formData: FormData) {
  const { session, membership } = await requireMembership();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Fehlende ID." };

  const template = await prisma.space.findFirst({
    where: {
      id,
      organizationId: membership.organizationId,
      type: "project",
      isTemplate: true,
    },
    include: { access: true },
  });
  if (!template || !canEditSpace(session.user, template, membership)) {
    return { error: "Kein Zugriff." };
  }

  await prisma.space.delete({ where: { id: template.id } });

  revalidatePath("/projects");
  revalidatePath(`/projects/${template.id}`);
  return { ok: true as const };
}

const projectNotesSchema = z.object({
  spaceId: z.string().min(1),
  notes: z.string().max(50000),
});

export async function updateProjectNotes(formData: FormData) {
  const { session, membership } = await requireMembership();
  const parsed = projectNotesSchema.safeParse({
    spaceId: formData.get("spaceId"),
    notes: String(formData.get("notes") ?? ""),
  });
  if (!parsed.success) {
    return { error: "Notiz ungültig." };
  }

  const space = await prisma.space.findUnique({
    where: { id: parsed.data.spaceId },
    include: { access: true },
  });
  if (
    !space ||
    space.type !== "project" ||
    !canEditSpace(session.user, space, membership)
  ) {
    return { error: "Kein Zugriff." };
  }

  await prisma.space.update({
    where: { id: space.id },
    data: { description: parsed.data.notes.trim() || null },
  });

  revalidatePath("/projects");
  revalidatePath(`/projects/${space.id}`);
  revalidatePath("/tasks");
  return { ok: true as const };
}
