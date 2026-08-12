"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireMembership } from "@/lib/session";
import { ensurePersonalSpace } from "@/lib/spaces";
import { canEditSpace, canViewSpace } from "@/lib/permissions";

const taskCreateSchema = z.object({
  spaceId: z.string().min(1),
  title: z.string().min(1).max(200),
  description: z.string().max(50000).optional(),
  dueAt: z.string().optional(),
  dueOffsetDays: z.string().optional(),
  assigneeId: z.string().optional(),
  groupId: z.string().optional(),
});

export async function createTask(formData: FormData) {
  const { session, membership } = await requireMembership();
  const parsed = taskCreateSchema.safeParse({
    spaceId: formData.get("spaceId"),
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    dueAt: formData.get("dueAt") || undefined,
    dueOffsetDays: formData.has("dueOffsetDays")
      ? String(formData.get("dueOffsetDays") ?? "")
      : undefined,
    assigneeId: formData.get("assigneeId") || undefined,
    groupId: formData.has("groupId")
      ? String(formData.get("groupId") ?? "")
      : undefined,
  });
  if (!parsed.success) {
    return { error: "Titel fehlt oder ist ungültig." };
  }

  const space = await prisma.space.findUnique({
    where: { id: parsed.data.spaceId },
    include: { access: true },
  });
  if (!space || !canEditSpace(session.user, space, membership)) {
    return { error: "Kein Zugriff auf diesen Space." };
  }

  let targetSpaceId = space.id;
  let assigneeId: string | null = session.user.id;
  let clearGroupForHandoff = false;

  if (space.type === "personal") {
    const requested =
      parsed.data.assigneeId && parsed.data.assigneeId.length > 0
        ? parsed.data.assigneeId
        : session.user.id;

    if (requested !== session.user.id) {
      const member = await prisma.membership.findUnique({
        where: {
          organizationId_userId: {
            organizationId: membership.organizationId,
            userId: requested,
          },
        },
        include: { user: { select: { id: true, name: true } } },
      });
      if (!member) return { error: "Person nicht im Team." };
      const theirSpace = await ensurePersonalSpace(
        membership.organizationId,
        member.user.id,
        member.user.name,
      );
      targetSpaceId = theirSpace.id;
      assigneeId = member.user.id;
      clearGroupForHandoff = true;
    } else {
      assigneeId = session.user.id;
    }
  } else if (parsed.data.assigneeId && parsed.data.assigneeId.length > 0) {
    const member = await prisma.membership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: membership.organizationId,
          userId: parsed.data.assigneeId,
        },
      },
    });
    if (!member) return { error: "Person nicht im Team." };
    assigneeId = parsed.data.assigneeId;
  }

  let groupId: string | null | undefined;
  if (clearGroupForHandoff) {
    groupId = null;
  } else if (parsed.data.groupId !== undefined) {
    if (parsed.data.groupId === "") {
      groupId = null;
    } else {
      const group = await prisma.taskGroup.findFirst({
        where: { id: parsed.data.groupId, spaceId: space.id },
      });
      if (!group) return { error: "Ungültige Gruppe." };
      groupId = group.id;
    }
  }

  let dueOffsetDays: number | null = null;
  if (parsed.data.dueOffsetDays !== undefined) {
    const raw = parsed.data.dueOffsetDays.trim();
    if (raw === "") {
      dueOffsetDays = null;
    } else {
      const n = Number.parseInt(raw, 10);
      if (!Number.isFinite(n)) {
        return { error: "Ungültiger Tage-Offset." };
      }
      dueOffsetDays = n;
    }
  }

  let dueAt: Date | null = parsed.data.dueAt
    ? new Date(parsed.data.dueAt)
    : null;
  if (
    dueOffsetDays != null &&
    space.type === "project" &&
    space.eventAt
  ) {
    const { dueAtFromEvent } = await import("@/lib/projects");
    dueAt = dueAtFromEvent(space.eventAt, dueOffsetDays);
  } else if (dueOffsetDays != null && space.isTemplate) {
    dueAt = null;
  } else if (parsed.data.dueAt && space.type === "project" && space.eventAt) {
    const { offsetFromEvent } = await import("@/lib/projects");
    dueOffsetDays = offsetFromEvent(space.eventAt, dueAt!);
  }

  await prisma.task.create({
    data: {
      spaceId: targetSpaceId,
      title: parsed.data.title.trim(),
      description: parsed.data.description?.trim() || null,
      assigneeId,
      createdById: session.user.id,
      dueAt,
      dueOffsetDays,
      status: "todo",
      ...(groupId !== undefined ? { groupId } : {}),
    },
  });

  revalidatePath("/home");
  revalidatePath("/tasks");
  revalidatePath(`/spaces/${space.id}`);
  revalidatePath("/projects");
  revalidatePath(`/projects/${space.id}`);

  return { ok: true as const };
}

const taskUpdateSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["todo", "doing", "done", "cancelled"]).optional(),
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(50000).optional(),
  dueAt: z.string().optional(),
  dueOffsetDays: z.string().optional(),
  assigneeId: z.string().optional(),
  groupId: z.string().optional(),
});

export async function updateTask(formData: FormData) {
  const { session, membership } = await requireMembership();
  const parsed = taskUpdateSchema.safeParse({
    id: formData.get("id"),
    status: formData.get("status") || undefined,
    title: formData.get("title") || undefined,
    description:
      formData.get("description") === null
        ? undefined
        : formData.has("description")
          ? String(formData.get("description") ?? "")
          : undefined,
    dueAt: formData.has("dueAt")
      ? String(formData.get("dueAt") ?? "")
      : undefined,
    dueOffsetDays: formData.has("dueOffsetDays")
      ? String(formData.get("dueOffsetDays") ?? "")
      : undefined,
    assigneeId: formData.has("assigneeId")
      ? String(formData.get("assigneeId") ?? "")
      : undefined,
    groupId: formData.has("groupId")
      ? String(formData.get("groupId") ?? "")
      : undefined,
  });
  if (!parsed.success) {
    return { error: "Ungültige Task-Daten." };
  }

  const task = await prisma.task.findUnique({
    where: { id: parsed.data.id },
    include: { space: { include: { access: true } } },
  });
  if (!task || !canViewSpace(session.user, task.space, membership)) {
    return { error: "Task nicht gefunden." };
  }
  if (!canEditSpace(session.user, task.space, membership)) {
    return { error: "Keine Berechtigung." };
  }

  const data: {
    status?: "todo" | "doing" | "done" | "cancelled";
    title?: string;
    description?: string | null;
    dueAt?: Date | null;
    dueOffsetDays?: number | null;
    assigneeId?: string | null;
    groupId?: string | null;
    spaceId?: string;
  } = {};

  if (parsed.data.status) data.status = parsed.data.status;
  if (parsed.data.title) data.title = parsed.data.title.trim();
  if (parsed.data.description !== undefined) {
    data.description = parsed.data.description.trim() || null;
  }

  if (parsed.data.dueOffsetDays !== undefined) {
    const raw = parsed.data.dueOffsetDays.trim();
    if (raw === "") {
      data.dueOffsetDays = null;
    } else {
      const n = Number.parseInt(raw, 10);
      if (!Number.isFinite(n)) {
        return { error: "Ungültiger Tage-Offset." };
      }
      data.dueOffsetDays = n;
    }
    if (
      data.dueOffsetDays != null &&
      task.space.type === "project" &&
      task.space.eventAt
    ) {
      const { dueAtFromEvent } = await import("@/lib/projects");
      data.dueAt = dueAtFromEvent(task.space.eventAt, data.dueOffsetDays);
    } else if (data.dueOffsetDays != null && task.space.isTemplate) {
      data.dueAt = null;
    }
  } else if (parsed.data.dueAt !== undefined) {
    data.dueAt = parsed.data.dueAt ? new Date(parsed.data.dueAt) : null;
    if (
      data.dueAt &&
      task.space.type === "project" &&
      task.space.eventAt
    ) {
      const { offsetFromEvent } = await import("@/lib/projects");
      data.dueOffsetDays = offsetFromEvent(task.space.eventAt, data.dueAt);
    } else {
      data.dueOffsetDays = null;
    }
  }

  let handedOffSpaceId: string | null = null;

  if (parsed.data.assigneeId !== undefined) {
    const nextAssignee =
      parsed.data.assigneeId === "" ? null : parsed.data.assigneeId;

    if (
      nextAssignee &&
      task.space.type === "personal" &&
      nextAssignee !== task.space.ownerUserId
    ) {
      const member = await prisma.membership.findUnique({
        where: {
          organizationId_userId: {
            organizationId: membership.organizationId,
            userId: nextAssignee,
          },
        },
        include: { user: { select: { id: true, name: true } } },
      });
      if (!member) return { error: "Person nicht im Team." };
      const theirSpace = await ensurePersonalSpace(
        membership.organizationId,
        member.user.id,
        member.user.name,
      );
      data.spaceId = theirSpace.id;
      data.assigneeId = member.user.id;
      data.groupId = null;
      handedOffSpaceId = theirSpace.id;
    } else if (nextAssignee && task.space.type !== "personal") {
      const member = await prisma.membership.findUnique({
        where: {
          organizationId_userId: {
            organizationId: membership.organizationId,
            userId: nextAssignee,
          },
        },
      });
      if (!member) return { error: "Person nicht im Team." };
      data.assigneeId = nextAssignee;
    } else {
      data.assigneeId = nextAssignee;
    }
  }

  if (
    parsed.data.groupId !== undefined &&
    data.groupId === undefined &&
    !handedOffSpaceId
  ) {
    if (parsed.data.groupId === "") {
      data.groupId = null;
    } else {
      const group = await prisma.taskGroup.findFirst({
        where: { id: parsed.data.groupId, spaceId: task.spaceId },
      });
      if (!group) return { error: "Ungültige Gruppe." };
      data.groupId = group.id;
    }
  }

  await prisma.task.update({
    where: { id: task.id },
    data,
  });

  revalidatePath("/home");
  revalidatePath("/tasks");
  revalidatePath(`/spaces/${task.spaceId}`);
  if (handedOffSpaceId) {
    revalidatePath(`/spaces/${handedOffSpaceId}`);
  }
  revalidatePath("/projects");
  revalidatePath(`/projects/${task.spaceId}`);
  return { ok: true as const };
}

async function loadEditableTask(taskId: string) {
  const { session, membership } = await requireMembership();
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { space: { include: { access: true } } },
  });
  if (!task || !canViewSpace(session.user, task.space, membership)) {
    return { error: "Task nicht gefunden." as const };
  }
  if (!canEditSpace(session.user, task.space, membership)) {
    return { error: "Keine Berechtigung." as const };
  }
  return { task, session, membership };
}

function revalidateTaskPaths(spaceId: string) {
  revalidatePath("/home");
  revalidatePath("/tasks");
  revalidatePath(`/spaces/${spaceId}`);
  revalidatePath("/projects");
  revalidatePath(`/projects/${spaceId}`);
}

/** Set status to cancelled (keeps the row visible under "Abgebrochen"). */
export async function cancelTask(taskId: string) {
  if (!taskId) return { error: "Fehlende ID." as const };
  const loaded = await loadEditableTask(taskId);
  if ("error" in loaded) return loaded;

  await prisma.task.update({
    where: { id: loaded.task.id },
    data: { status: "cancelled" },
  });

  revalidateTaskPaths(loaded.task.spaceId);
  return { ok: true as const };
}

/** Soft-delete: sets archivedAt so the task disappears from all lists. */
export async function deleteTask(taskId: string) {
  if (!taskId) return { error: "Fehlende ID." as const };
  const loaded = await loadEditableTask(taskId);
  if ("error" in loaded) return loaded;
  if (loaded.task.archivedAt) {
    return { error: "Task ist bereits gelöscht." as const };
  }

  await prisma.task.update({
    where: { id: loaded.task.id },
    data: { archivedAt: new Date() },
  });

  revalidateTaskPaths(loaded.task.spaceId);
  return { ok: true as const };
}

/** Undo soft-delete: clears archivedAt. */
export async function restoreTask(taskId: string) {
  if (!taskId) return { error: "Fehlende ID." as const };
  const loaded = await loadEditableTask(taskId);
  if ("error" in loaded) return loaded;
  if (!loaded.task.archivedAt) {
    return { error: "Task ist nicht gelöscht." as const };
  }

  await prisma.task.update({
    where: { id: loaded.task.id },
    data: { archivedAt: null },
  });

  revalidateTaskPaths(loaded.task.spaceId);
  return { ok: true as const };
}

const taskGroupCreateSchema = z.object({
  spaceId: z.string().min(1),
  name: z.string().min(1).max(80),
});

export async function createTaskGroup(formData: FormData) {
  const { session, membership } = await requireMembership();
  const parsed = taskGroupCreateSchema.safeParse({
    spaceId: formData.get("spaceId"),
    name: formData.get("name"),
  });
  if (!parsed.success) {
    return { error: "Gruppenname fehlt oder ist ungültig." };
  }

  const space = await prisma.space.findUnique({
    where: { id: parsed.data.spaceId },
    include: { access: true },
  });
  if (!space || !canEditSpace(session.user, space, membership)) {
    return { error: "Kein Zugriff auf diesen Space." };
  }

  const maxOrder = await prisma.taskGroup.aggregate({
    where: { spaceId: space.id },
    _max: { sortOrder: true },
  });

  const group = await prisma.taskGroup.create({
    data: {
      spaceId: space.id,
      name: parsed.data.name.trim(),
      sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
    },
  });

  revalidatePath("/tasks");
  revalidatePath(`/spaces/${space.id}`);
  revalidatePath(`/projects/${space.id}`);
  return { ok: true as const, id: group.id };
}

const taskGroupUpdateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(80),
});

export async function updateTaskGroup(formData: FormData) {
  const { session, membership } = await requireMembership();
  const parsed = taskGroupUpdateSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
  });
  if (!parsed.success) {
    return { error: "Ungültige Gruppendaten." };
  }

  const group = await prisma.taskGroup.findUnique({
    where: { id: parsed.data.id },
    include: { space: { include: { access: true } } },
  });
  if (!group || !canEditSpace(session.user, group.space, membership)) {
    return { error: "Kein Zugriff." };
  }

  await prisma.taskGroup.update({
    where: { id: group.id },
    data: { name: parsed.data.name.trim() },
  });

  revalidatePath("/tasks");
  revalidatePath(`/spaces/${group.spaceId}`);
  revalidatePath(`/projects/${group.spaceId}`);
  return { ok: true as const };
}

export async function deleteTaskGroup(formData: FormData) {
  const { session, membership } = await requireMembership();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Fehlende ID." };

  const group = await prisma.taskGroup.findUnique({
    where: { id },
    include: { space: { include: { access: true } } },
  });
  if (!group || !canEditSpace(session.user, group.space, membership)) {
    return { error: "Kein Zugriff." };
  }

  await prisma.taskGroup.delete({ where: { id: group.id } });

  revalidatePath("/tasks");
  revalidatePath(`/spaces/${group.spaceId}`);
  revalidatePath(`/projects/${group.spaceId}`);
  return { ok: true as const };
}
