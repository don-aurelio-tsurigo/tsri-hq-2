"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { hashPassword } from "better-auth/crypto";
import { prisma } from "@/lib/db";
import { requireAdmin, requireMembership, requireSession } from "@/lib/session";
import { ensurePersonalSpace } from "@/lib/spaces";
import { canEditSpace, canViewSpace } from "@/lib/permissions";
import {
  DEFAULT_ARTICLE_STAGE,
  isArticleCategory,
  isArticleStage,
} from "@/lib/editorial";
import {
  formatWeekdays,
  frequencyFromWeekdays,
  isoWeekdayFromDateKey,
  isWeekday,
  scheduledDateKeysForWeeks,
  WEEKDAY_FULL_LABELS,
} from "@/lib/newsletter-constants";
import {
  isTimeEntryType,
  parseTimeToMinutes,
} from "@/lib/time-tracking-constants";

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "member"]).default("member"),
});

export async function createInvitation(formData: FormData) {
  const { session, membership } = await requireAdmin();
  const parsed = inviteSchema.safeParse({
    email: formData.get("email"),
    role: formData.get("role") || "member",
  });
  if (!parsed.success) {
    return { error: "Ungültige E-Mail oder Rolle." };
  }

  const email = parsed.data.email.toLowerCase().trim();
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    const alreadyMember = await prisma.membership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: membership.organizationId,
          userId: existingUser.id,
        },
      },
    });
    if (alreadyMember && !alreadyMember.archivedAt) {
      return { error: "Diese Person ist bereits im Team." };
    }
  }

  const openInvite = await prisma.invitation.findFirst({
    where: {
      organizationId: membership.organizationId,
      email,
      acceptedAt: null,
      expiresAt: { gt: new Date() },
    },
  });
  if (openInvite) {
    return {
      error: "Es gibt bereits eine offene Einladung für diese E-Mail.",
      token: openInvite.token,
    };
  }

  const invitation = await prisma.invitation.create({
    data: {
      email,
      organizationId: membership.organizationId,
      role: parsed.data.role,
      invitedById: session.user.id,
      expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    },
  });

  revalidatePath("/settings/members");
  return { ok: true as const, token: invitation.token };
}

const acceptSchema = z.object({
  token: z.string().min(1),
  name: z.string().min(2).max(80),
  password: z.string().min(8).max(128),
});

export async function acceptInvitation(formData: FormData) {
  const parsed = acceptSchema.safeParse({
    token: formData.get("token"),
    name: formData.get("name"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: "Bitte Name (min. 2) und Passwort (min. 8) angeben." };
  }

  const invitation = await prisma.invitation.findUnique({
    where: { token: parsed.data.token },
    include: { organization: true },
  });

  if (!invitation || invitation.acceptedAt) {
    return { error: "Einladung ungültig oder bereits benutzt." };
  }
  if (invitation.expiresAt < new Date()) {
    return { error: "Diese Einladung ist abgelaufen." };
  }

  const email = invitation.email.toLowerCase();
  let user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    const hashed = await hashPassword(parsed.data.password);
    user = await prisma.user.create({
      data: {
        name: parsed.data.name.trim(),
        email,
        emailVerified: true,
        accounts: {
          create: {
            accountId: email,
            providerId: "credential",
            password: hashed,
          },
        },
      },
    });
  } else {
    // Existing user: ensure password credential exists / updates
    const hashed = await hashPassword(parsed.data.password);
    const account = await prisma.account.findFirst({
      where: { userId: user.id, providerId: "credential" },
    });
    if (account) {
      await prisma.account.update({
        where: { id: account.id },
        data: { password: hashed },
      });
    } else {
      await prisma.account.create({
        data: {
          userId: user.id,
          accountId: email,
          providerId: "credential",
          password: hashed,
        },
      });
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { name: parsed.data.name.trim() },
    });
  }

  await prisma.membership.upsert({
    where: {
      organizationId_userId: {
        organizationId: invitation.organizationId,
        userId: user.id,
      },
    },
    create: {
      organizationId: invitation.organizationId,
      userId: user.id,
      role: invitation.role,
    },
    update: { role: invitation.role, archivedAt: null },
  });

  await ensurePersonalSpace(
    invitation.organizationId,
    user.id,
    parsed.data.name.trim(),
  );

  await prisma.invitation.update({
    where: { id: invitation.id },
    data: { acceptedAt: new Date() },
  });

  redirect(`/login?email=${encodeURIComponent(email)}&joined=1`);
}

export async function revokeInvitation(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Fehlende ID." };

  await prisma.invitation.delete({ where: { id } }).catch(() => null);
  revalidatePath("/settings/members");
  return { ok: true as const };
}

const taskCreateSchema = z.object({
  spaceId: z.string().min(1),
  title: z.string().min(1).max(200),
  description: z.string().max(50000).optional(),
  dueAt: z.string().optional(),
  assigneeId: z.string().optional(),
  groupId: z.string().optional(),
  kind: z.enum(["generic", "article", "chore", "cooking"]).optional(),
  category: z.string().optional(),
  stage: z.string().optional(),
  eigenleistungRubrikId: z.string().optional(),
  publishAt: z.string().optional(),
});

export async function createTask(formData: FormData) {
  const { session, membership } = await requireMembership();
  const parsed = taskCreateSchema.safeParse({
    spaceId: formData.get("spaceId"),
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    dueAt: formData.get("dueAt") || undefined,
    assigneeId: formData.get("assigneeId") || undefined,
    groupId: formData.has("groupId")
      ? String(formData.get("groupId") ?? "")
      : undefined,
    kind: formData.get("kind") || "generic",
    category: formData.get("category") || undefined,
    stage: formData.get("stage") || undefined,
    eigenleistungRubrikId: formData.has("eigenleistungRubrikId")
      ? String(formData.get("eigenleistungRubrikId") ?? "")
      : undefined,
    publishAt: formData.has("publishAt")
      ? String(formData.get("publishAt") ?? "")
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

  const kind = parsed.data.kind ?? "generic";

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

  const category =
    kind === "article" && isArticleCategory(parsed.data.category)
      ? parsed.data.category
      : undefined;

  let eigenleistungRubrikId: string | null | undefined;
  if (kind === "article" && parsed.data.eigenleistungRubrikId !== undefined) {
    if (parsed.data.eigenleistungRubrikId === "") {
      eigenleistungRubrikId = null;
    } else {
      const rubrik = await prisma.eigenleistungRubrik.findFirst({
        where: {
          id: parsed.data.eigenleistungRubrikId,
          organizationId: membership.organizationId,
          active: true,
        },
      });
      if (!rubrik) return { error: "Ungültige Eigenleistungs-Rubrik." };
      eigenleistungRubrikId = rubrik.id;
    }
  }

  const stage =
    kind === "article"
      ? isArticleStage(parsed.data.stage)
        ? parsed.data.stage
        : DEFAULT_ARTICLE_STAGE
      : undefined;

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

  const createData: {
    spaceId: string;
    title: string;
    description: string | null;
    kind: "generic" | "article" | "chore" | "cooking";
    stage?: string;
    category?:
      | "nuetzliches"
      | "leicht_und_seicht"
      | "persoenliche_perspektive"
      | "groesseres_ganzes"
      | "aha_perspektive";
    eigenleistungRubrikId?: string | null;
    publishAt?: Date | null;
    assigneeId: string | null;
    createdById: string;
    dueAt: Date | null;
    groupId?: string | null;
    status: "todo" | "doing" | "done" | "cancelled";
  } = {
    spaceId: targetSpaceId,
    title: parsed.data.title.trim(),
    description: parsed.data.description?.trim() || null,
    kind,
    assigneeId,
    createdById: session.user.id,
    dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : null,
    status:
      stage === "publiziert"
        ? "done"
        : stage === "in_arbeit"
          ? "doing"
          : "todo",
  };

  if (groupId !== undefined) createData.groupId = groupId;

  // Only send editorial fields for articles — avoids invalid args on generic creates
  if (kind === "article") {
    createData.stage = stage;
    if (category) createData.category = category;
    if (eigenleistungRubrikId !== undefined) {
      createData.eigenleistungRubrikId = eigenleistungRubrikId;
    }
    if (parsed.data.publishAt !== undefined) {
      const raw = parsed.data.publishAt.trim();
      if (raw !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        return { error: "Ungültiges Publikationsdatum." };
      }
      createData.publishAt = raw
        ? new Date(`${raw}T12:00:00.000Z`)
        : null;
    }
  }

  await prisma.task.create({
    data: createData,
  });

  revalidatePath("/home");
  revalidatePath("/tasks");
  revalidatePath(`/spaces/${space.id}`);
  revalidatePath("/programm");
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
  publishAt: z.string().optional(),
  stage: z.string().optional(),
  category: z.string().optional(),
  eigenleistungRubrikId: z.string().optional(),
  assigneeId: z.string().optional(),
  groupId: z.string().optional(),
  clearCategory: z.string().optional(),
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
    publishAt: formData.has("publishAt")
      ? String(formData.get("publishAt") ?? "")
      : undefined,
    stage: formData.get("stage") || undefined,
    category: formData.has("category")
      ? String(formData.get("category") ?? "")
      : undefined,
    eigenleistungRubrikId: formData.has("eigenleistungRubrikId")
      ? String(formData.get("eigenleistungRubrikId") ?? "")
      : undefined,
    assigneeId: formData.has("assigneeId")
      ? String(formData.get("assigneeId") ?? "")
      : undefined,
    groupId: formData.has("groupId")
      ? String(formData.get("groupId") ?? "")
      : undefined,
    clearCategory: formData.get("clearCategory") || undefined,
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

  const stage = isArticleStage(parsed.data.stage) ? parsed.data.stage : undefined;

  const data: {
    status?: "todo" | "doing" | "done" | "cancelled";
    title?: string;
    description?: string | null;
    dueAt?: Date | null;
    publishAt?: Date | null;
    stage?: string;
    category?:
      | "nuetzliches"
      | "leicht_und_seicht"
      | "persoenliche_perspektive"
      | "groesseres_ganzes"
      | "aha_perspektive"
      | null;
    eigenleistungRubrikId?: string | null;
    assigneeId?: string | null;
    groupId?: string | null;
    spaceId?: string;
  } = {};

  if (parsed.data.status) data.status = parsed.data.status;
  if (parsed.data.title) data.title = parsed.data.title.trim();
  if (parsed.data.description !== undefined) {
    data.description = parsed.data.description.trim() || null;
  }
  if (parsed.data.dueAt !== undefined) {
    data.dueAt = parsed.data.dueAt ? new Date(parsed.data.dueAt) : null;
  }
  if (parsed.data.publishAt !== undefined) {
    const raw = parsed.data.publishAt.trim();
    if (raw !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      return { error: "Ungültiges Publikationsdatum." };
    }
    data.publishAt = raw ? new Date(`${raw}T12:00:00.000Z`) : null;
  }
  if (stage) {
    data.stage = stage;
    data.status =
      stage === "publiziert"
        ? "done"
        : stage === "in_arbeit"
          ? "doing"
          : "todo";
  }
  if (parsed.data.clearCategory === "1") {
    data.category = null;
  } else if (parsed.data.category !== undefined) {
    data.category =
      parsed.data.category === ""
        ? null
        : isArticleCategory(parsed.data.category)
          ? parsed.data.category
          : null;
  }
  if (parsed.data.eigenleistungRubrikId !== undefined) {
    if (parsed.data.eigenleistungRubrikId === "") {
      data.eigenleistungRubrikId = null;
    } else {
      const rubrik = await prisma.eigenleistungRubrik.findFirst({
        where: {
          id: parsed.data.eigenleistungRubrikId,
          organizationId: membership.organizationId,
        },
      });
      if (!rubrik) return { error: "Ungültige Eigenleistungs-Rubrik." };
      data.eigenleistungRubrikId = rubrik.id;
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
    } else if (
      nextAssignee &&
      task.space.type !== "personal"
    ) {
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
  revalidatePath("/programm");
  revalidatePath("/projects");
  revalidatePath(`/projects/${task.spaceId}`);
  return { ok: true as const };
}

export async function moveArticleStage(formData: FormData) {
  const stage = String(formData.get("stage") ?? "");
  if (!isArticleStage(stage)) {
    return { error: "Ungültige Stage." };
  }
  formData.set("stage", stage);
  return updateTask(formData);
}

export async function setArticlePublishAt(formData: FormData) {
  const { session, membership } = await requireMembership();
  const id = String(formData.get("id") ?? "");
  const raw = String(formData.get("publishAt") ?? "").trim();
  if (!id) return { error: "Fehlende ID." };
  if (raw !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return { error: "Ungültiges Datum." };
  }

  const task = await prisma.task.findUnique({
    where: { id },
    include: { space: { include: { access: true } } },
  });
  if (
    !task ||
    task.kind !== "article" ||
    !canEditSpace(session.user, task.space, membership)
  ) {
    return { error: "Kein Zugriff." };
  }

  await prisma.task.update({
    where: { id },
    data: {
      publishAt: raw ? new Date(`${raw}T12:00:00.000Z`) : null,
    },
  });

  revalidatePath("/programm");
  revalidatePath(`/spaces/${task.spaceId}`);
  revalidatePath("/home");
  return { ok: true as const };
}

async function loadEditableArticle(id: string) {
  const { session, membership } = await requireMembership();
  const task = await prisma.task.findUnique({
    where: { id },
    include: { space: { include: { access: true } } },
  });
  if (
    !task ||
    task.kind !== "article" ||
    !canEditSpace(session.user, task.space, membership)
  ) {
    return { error: "Kein Zugriff." as const };
  }
  return { task, session, membership };
}

export async function archiveArticle(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Fehlende ID." };
  const loaded = await loadEditableArticle(id);
  if ("error" in loaded) return loaded;

  await prisma.task.update({
    where: { id },
    data: { archivedAt: new Date() },
  });

  revalidatePath("/programm");
  revalidatePath(`/spaces/${loaded.task.spaceId}`);
  revalidatePath("/home");
  return { ok: true as const };
}

export async function unarchiveArticle(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Fehlende ID." };
  const loaded = await loadEditableArticle(id);
  if ("error" in loaded) return loaded;

  await prisma.task.update({
    where: { id },
    data: { archivedAt: null },
  });

  revalidatePath("/programm");
  revalidatePath(`/spaces/${loaded.task.spaceId}`);
  revalidatePath("/home");
  return { ok: true as const };
}

export async function deleteArticle(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Fehlende ID." };
  const loaded = await loadEditableArticle(id);
  if ("error" in loaded) return loaded;

  await prisma.task.delete({ where: { id } });

  revalidatePath("/programm");
  revalidatePath(`/spaces/${loaded.task.spaceId}`);
  revalidatePath("/home");
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

const projectCreateSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(5000).optional(),
  templateId: z
    .string()
    .trim()
    .transform((v) => (v.length === 0 ? undefined : v))
    .optional(),
});

export async function createProject(formData: FormData) {
  const { session, membership } = await requireMembership();
  const parsed = projectCreateSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    templateId: formData.get("templateId") || undefined,
  });
  if (!parsed.success) {
    return { error: "Projektname fehlt oder ist ungültig (min. 2 Zeichen)." };
  }

  const { uniqueProjectSlug, copyProjectTaskTitles } =
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
    },
  });

  if (template) {
    await copyProjectTaskTitles(template.id, project.id, session.user.id);
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
    data: { archivedAt: new Date() },
  });

  revalidatePath("/projects");
  revalidatePath(`/projects/${project.id}`);
  revalidatePath("/tasks");
  revalidatePath("/home");
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

  revalidatePath("/projects");
  revalidatePath(`/projects/${project.id}`);
  revalidatePath("/tasks");
  revalidatePath("/home");
  return { ok: true as const };
}

const saveAsTemplateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(2).max(120).optional(),
});

/** Clone a project (task titles) into a new template project. */
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

  const { uniqueProjectSlug, copyProjectTaskTitles } =
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
    },
  });

  await copyProjectTaskTitles(source.id, template.id, session.user.id);

  revalidatePath("/projects");
  revalidatePath(`/projects/${source.id}`);
  revalidatePath(`/projects/${template.id}`);
  return { ok: true as const, id: template.id };
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

export async function createBootstrapOrganization(formData: FormData): Promise<void> {
  const session = await requireSession();
  const existing = await prisma.membership.findFirst({
    where: { userId: session.user.id },
  });
  if (existing) {
    redirect("/home");
  }

  // Only allow bootstrap if no orgs exist yet
  const orgCount = await prisma.organization.count();
  if (orgCount > 0) {
    redirect("/onboarding");
  }

  const name = String(formData.get("name") ?? "").trim() || "Unser Team";
  const slug =
    String(formData.get("slug") ?? "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-") || "team";

  const org = await prisma.organization.create({
    data: {
      name,
      slug,
      memberships: {
        create: {
          userId: session.user.id,
          role: "admin",
        },
      },
    },
  });

  const { ensureDefaultTeamSpaces } = await import("@/lib/spaces");
  await ensureDefaultTeamSpaces(org.id);
  await ensurePersonalSpace(org.id, session.user.id, session.user.name);

  redirect("/home");
}

const notesSchema = z.object({
  notes: z.string().max(50000),
});

export async function updatePrivateNotes(formData: FormData) {
  const { session } = await requireMembership();
  const parsed = notesSchema.safeParse({
    notes: String(formData.get("notes") ?? ""),
  });
  if (!parsed.success) {
    return { error: "Notiz ungültig." };
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { privateNotes: parsed.data.notes },
  });

  revalidatePath("/home");
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

const profileSchema = z.object({
  userId: z.string().min(1),
  phone: z.string().max(40).optional(),
  birthDate: z.string().optional(),
});

export async function updateMemberProfile(formData: FormData) {
  const { session, membership } = await requireMembership();
  const parsed = profileSchema.safeParse({
    userId: formData.get("userId"),
    phone: formData.has("phone") ? String(formData.get("phone") ?? "") : undefined,
    birthDate: formData.has("birthDate")
      ? String(formData.get("birthDate") ?? "")
      : undefined,
  });
  if (!parsed.success) {
    return { error: "Ungültige Profildaten." };
  }

  const isSelf = parsed.data.userId === session.user.id;
  const isAdmin = membership.role === "admin";
  if (!isSelf && !isAdmin) {
    return { error: "Keine Berechtigung." };
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

  const phone =
    parsed.data.phone !== undefined
      ? parsed.data.phone.trim() || null
      : undefined;
  const birthDate =
    parsed.data.birthDate !== undefined
      ? parsed.data.birthDate
        ? new Date(parsed.data.birthDate)
        : null
      : undefined;

  await prisma.user.update({
    where: { id: parsed.data.userId },
    data: {
      ...(phone !== undefined ? { phone } : {}),
      ...(birthDate !== undefined ? { birthDate } : {}),
    },
  });

  const teamInfos = await prisma.space.findFirst({
    where: {
      organizationId: membership.organizationId,
      slug: "team-infos",
    },
    select: { id: true },
  });
  if (teamInfos) {
    revalidatePath(`/spaces/${teamInfos.id}`);
  }
  return { ok: true as const };
}

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

  const maxSort = await prisma.task.aggregate({
    where: { spaceId: space.id, kind: "chore" },
    _max: { sortOrder: true },
  });

  await prisma.task.create({
    data: {
      spaceId: space.id,
      title: parsed.data.title.trim(),
      description: parsed.data.description?.trim() || null,
      kind: "chore",
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

  const task = await prisma.task.findUnique({
    where: { id },
    include: { space: { include: { access: true } } },
  });
  if (
    !task ||
    task.kind !== "chore" ||
    !canEditSpace(session.user, task.space, membership)
  ) {
    return { error: "Kein Zugriff." };
  }

  await prisma.task.update({
    where: { id },
    data: {
      title,
      description: description.trim() || null,
    },
  });

  revalidatePath(`/spaces/${task.spaceId}`);
  revalidatePath("/home");
  return { ok: true as const };
}

export async function deleteChore(formData: FormData) {
  const { session, membership } = await requireMembership();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Fehlende ID." };

  const task = await prisma.task.findUnique({
    where: { id },
    include: { space: { include: { access: true } } },
  });
  if (
    !task ||
    task.kind !== "chore" ||
    !canEditSpace(session.user, task.space, membership)
  ) {
    return { error: "Kein Zugriff." };
  }

  await prisma.task.delete({ where: { id } });
  revalidatePath(`/spaces/${task.spaceId}`);
  revalidatePath("/home");
  return { ok: true as const };
}

export async function setChoreAssignees(formData: FormData) {
  const { session, membership } = await requireMembership();
  const id = String(formData.get("id") ?? "");
  const assigneeIds = formData.getAll("assigneeIds").map(String).filter(Boolean);
  if (!id) return { error: "Fehlende ID." };

  const task = await prisma.task.findUnique({
    where: { id },
    include: { space: { include: { access: true } } },
  });
  if (
    !task ||
    task.kind !== "chore" ||
    !canEditSpace(session.user, task.space, membership)
  ) {
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
    prisma.taskAssignment.deleteMany({ where: { taskId: id } }),
    prisma.taskAssignment.createMany({
      data: [...validIds].map((userId) => ({ taskId: id, userId })),
    }),
  ]);

  revalidatePath(`/spaces/${task.spaceId}`);
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
    },
    update: {
      userId: parsed.data.userId,
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

const newsletterTypeSchema = z.object({
  name: z.string().trim().min(1).max(120),
  weekdays: z
    .array(z.coerce.number().int().min(1).max(7))
    .min(1, "Mindestens ein Wochentag")
    .transform((days) => [...new Set(days)].sort((a, b) => a - b)),
});

function parseNewsletterTypeForm(formData: FormData) {
  return newsletterTypeSchema.safeParse({
    name: formData.get("name"),
    weekdays: formData.getAll("weekdays"),
  });
}

export async function createNewsletterType(formData: FormData) {
  const { membership } = await requireAdmin();
  const parsed = parseNewsletterTypeForm(formData);
  if (!parsed.success) {
    return { error: "Name und mind. ein Wochentag nötig." };
  }

  const frequency = frequencyFromWeekdays(parsed.data.weekdays);

  const existing = await prisma.newsletterType.findUnique({
    where: {
      organizationId_name: {
        organizationId: membership.organizationId,
        name: parsed.data.name,
      },
    },
  });
  if (existing) {
    if (!existing.active) {
      await prisma.newsletterType.update({
        where: { id: existing.id },
        data: {
          active: true,
          frequency,
          weekdays: parsed.data.weekdays,
        },
      });
      revalidatePath("/settings/newsletter");
      revalidatePath("/newsletter");
      return { ok: true as const, id: existing.id };
    }
    return { error: "Diesen Newsletter-Typ gibt es schon." };
  }

  const maxSort = await prisma.newsletterType.aggregate({
    where: { organizationId: membership.organizationId },
    _max: { sortOrder: true },
  });

  const created = await prisma.newsletterType.create({
    data: {
      organizationId: membership.organizationId,
      name: parsed.data.name,
      frequency,
      weekdays: parsed.data.weekdays,
      sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
    },
  });

  revalidatePath("/settings/newsletter");
  revalidatePath("/newsletter");
  return { ok: true as const, id: created.id };
}

export async function updateNewsletterType(formData: FormData) {
  const { membership } = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Fehlende ID." };

  const parsed = parseNewsletterTypeForm(formData);
  if (!parsed.success) {
    return { error: "Name und mind. ein Wochentag nötig." };
  }

  const type = await prisma.newsletterType.findFirst({
    where: { id, organizationId: membership.organizationId },
  });
  if (!type) return { error: "Kein Zugriff." };

  const clash = await prisma.newsletterType.findFirst({
    where: {
      organizationId: membership.organizationId,
      name: parsed.data.name,
      NOT: { id },
    },
  });
  if (clash) return { error: "Diesen Namen gibt es schon." };

  await prisma.newsletterType.update({
    where: { id },
    data: {
      name: parsed.data.name,
      frequency: frequencyFromWeekdays(parsed.data.weekdays),
      weekdays: parsed.data.weekdays,
    },
  });

  revalidatePath("/settings/newsletter");
  revalidatePath("/newsletter");
  return { ok: true as const };
}

export async function updateNewsletterHideHolidays(formData: FormData) {
  const { membership } = await requireAdmin();
  const hide = formData.get("hidePublicHolidays") === "on" ||
    formData.get("hidePublicHolidays") === "true";

  await prisma.organization.update({
    where: { id: membership.organizationId },
    data: { hideNewsletterHolidays: hide },
  });

  revalidatePath("/settings/newsletter");
  revalidatePath("/newsletter");
  return { ok: true as const };
}

const blockedRangeSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  label: z
    .string()
    .trim()
    .max(120)
    .transform((v) => (v.length === 0 ? null : v)),
});

export async function createNewsletterBlockedRange(formData: FormData) {
  const { membership } = await requireAdmin();
  const parsed = blockedRangeSchema.safeParse({
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    label: formData.get("label") ?? "",
  });
  if (!parsed.success) {
    return { error: "Bitte Start- und Enddatum prüfen." };
  }
  if (parsed.data.endDate < parsed.data.startDate) {
    return { error: "Enddatum muss nach dem Startdatum liegen." };
  }

  await prisma.newsletterBlockedRange.create({
    data: {
      organizationId: membership.organizationId,
      startDate: new Date(`${parsed.data.startDate}T12:00:00.000Z`),
      endDate: new Date(`${parsed.data.endDate}T12:00:00.000Z`),
      label: parsed.data.label,
    },
  });

  revalidatePath("/settings/newsletter");
  revalidatePath("/newsletter");
  return { ok: true as const };
}

export async function deleteNewsletterBlockedRange(formData: FormData) {
  const { membership } = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Fehlende ID." };

  const range = await prisma.newsletterBlockedRange.findFirst({
    where: { id, organizationId: membership.organizationId },
  });
  if (!range) return { error: "Kein Zugriff." };

  await prisma.newsletterBlockedRange.delete({ where: { id } });

  revalidatePath("/settings/newsletter");
  revalidatePath("/newsletter");
  return { ok: true as const };
}

function assertCampaignMatchesSchedule(
  weekdays: number[],
  dateKey: string,
): string | null {
  if (weekdays.length === 0) return null;
  const weekday = isoWeekdayFromDateKey(dateKey);
  if (!weekday || !weekdays.includes(weekday)) {
    const dayLabel =
      weekday && isWeekday(weekday)
        ? WEEKDAY_FULL_LABELS[weekday]
        : "Dieses Datum";
    return `${dayLabel} ist kein Erscheinungstag (${formatWeekdays(weekdays)}).`;
  }
  return null;
}

const newsletterCampaignSchema = z.object({
  typeId: z.string().min(1),
  authorId: z
    .string()
    .trim()
    .transform((v) => (v.length === 0 ? null : v)),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  campaignUrl: z
    .string()
    .trim()
    .transform((v) => (v.length === 0 ? null : v))
    .pipe(z.union([z.null(), z.string().url()])),
  status: z.enum(["planned", "published", "skipped"]).default("published"),
  note: z
    .string()
    .trim()
    .max(500)
    .transform((v) => (v.length === 0 ? null : v)),
});

async function resolveOptionalAuthor(
  organizationId: string,
  authorId: string | null,
) {
  if (!authorId) return { ok: true as const, authorId: null };
  const authorMembership = await prisma.membership.findUnique({
    where: {
      organizationId_userId: {
        organizationId,
        userId: authorId,
      },
    },
  });
  if (!authorMembership || authorMembership.archivedAt) {
    return { ok: false as const, error: "Autor:in ist nicht im Team." };
  }
  return { ok: true as const, authorId };
}

export async function createNewsletterCampaign(formData: FormData) {
  const { session, membership } = await requireMembership();
  const parsed = newsletterCampaignSchema.safeParse({
    typeId: formData.get("typeId"),
    authorId: formData.get("authorId") ?? "",
    date: formData.get("date"),
    campaignUrl: formData.get("campaignUrl") ?? "",
    status: formData.get("status") || "published",
    note: formData.get("note") ?? "",
  });
  if (!parsed.success) {
    return { error: "Bitte Typ und Datum prüfen." };
  }

  const type = await prisma.newsletterType.findFirst({
    where: {
      id: parsed.data.typeId,
      organizationId: membership.organizationId,
      active: true,
    },
  });
  if (!type) return { error: "Newsletter-Typ nicht gefunden." };

  const scheduleError = assertCampaignMatchesSchedule(
    type.weekdays,
    parsed.data.date,
  );
  if (scheduleError) return { error: scheduleError };

  const author = await resolveOptionalAuthor(
    membership.organizationId,
    parsed.data.authorId,
  );
  if (!author.ok) return { error: author.error };

  await prisma.newsletterCampaign.create({
    data: {
      typeId: type.id,
      authorId: author.authorId,
      createdById: session.user.id,
      date: new Date(`${parsed.data.date}T12:00:00.000Z`),
      campaignUrl: parsed.data.campaignUrl,
      status: parsed.data.status,
      note: parsed.data.note,
    },
  });

  revalidatePath("/newsletter");
  return { ok: true as const };
}

export async function updateNewsletterCampaign(formData: FormData) {
  const { membership } = await requireMembership();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Fehlende ID." };

  const parsed = newsletterCampaignSchema.safeParse({
    typeId: formData.get("typeId"),
    authorId: formData.get("authorId") ?? "",
    date: formData.get("date"),
    campaignUrl: formData.get("campaignUrl") ?? "",
    status: formData.get("status") || "published",
    note: formData.get("note") ?? "",
  });
  if (!parsed.success) {
    return { error: "Bitte Typ und Datum prüfen." };
  }

  const campaign = await prisma.newsletterCampaign.findUnique({
    where: { id },
    include: { type: true },
  });
  if (
    !campaign ||
    campaign.type.organizationId !== membership.organizationId
  ) {
    return { error: "Kein Zugriff." };
  }

  const type = await prisma.newsletterType.findFirst({
    where: {
      id: parsed.data.typeId,
      organizationId: membership.organizationId,
      active: true,
    },
  });
  if (!type) return { error: "Newsletter-Typ nicht gefunden." };

  const scheduleError = assertCampaignMatchesSchedule(
    type.weekdays,
    parsed.data.date,
  );
  if (scheduleError) return { error: scheduleError };

  const author = await resolveOptionalAuthor(
    membership.organizationId,
    parsed.data.authorId,
  );
  if (!author.ok) return { error: author.error };

  await prisma.newsletterCampaign.update({
    where: { id },
    data: {
      typeId: type.id,
      authorId: author.authorId,
      date: new Date(`${parsed.data.date}T12:00:00.000Z`),
      campaignUrl: parsed.data.campaignUrl,
      status: parsed.data.status,
      note: parsed.data.note,
    },
  });

  revalidatePath("/newsletter");
  return { ok: true as const };
}

export async function deleteNewsletterCampaign(formData: FormData) {
  const { membership } = await requireMembership();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Fehlende ID." };

  const campaign = await prisma.newsletterCampaign.findUnique({
    where: { id },
    include: { type: true },
  });
  if (
    !campaign ||
    campaign.type.organizationId !== membership.organizationId
  ) {
    return { error: "Kein Zugriff." };
  }

  await prisma.newsletterCampaign.delete({ where: { id } });
  revalidatePath("/newsletter");
  return { ok: true as const };
}

function parseBulkIds(formData: FormData) {
  const raw = String(formData.get("ids") ?? "");
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function bulkDeleteNewsletterCampaigns(formData: FormData) {
  const { membership } = await requireMembership();
  const ids = parseBulkIds(formData);
  if (ids.length === 0) return { error: "Keine Kampagnen ausgewählt." };

  const campaigns = await prisma.newsletterCampaign.findMany({
    where: { id: { in: ids } },
    include: { type: { select: { organizationId: true } } },
  });
  if (campaigns.length !== ids.length) {
    return { error: "Mindestens eine Kampagne wurde nicht gefunden." };
  }
  if (
    campaigns.some((c) => c.type.organizationId !== membership.organizationId)
  ) {
    return { error: "Kein Zugriff." };
  }

  await prisma.newsletterCampaign.deleteMany({
    where: { id: { in: ids } },
  });
  revalidatePath("/newsletter");
  return { ok: true as const, count: ids.length };
}

export async function bulkAssignNewsletterCampaignAuthor(formData: FormData) {
  const { membership } = await requireMembership();
  const ids = parseBulkIds(formData);
  if (ids.length === 0) return { error: "Keine Kampagnen ausgewählt." };

  const author = await resolveOptionalAuthor(
    membership.organizationId,
    String(formData.get("authorId") ?? ""),
  );
  if (!author.ok) return { error: author.error };

  const campaigns = await prisma.newsletterCampaign.findMany({
    where: { id: { in: ids } },
    include: { type: { select: { organizationId: true } } },
  });
  if (campaigns.length !== ids.length) {
    return { error: "Mindestens eine Kampagne wurde nicht gefunden." };
  }
  if (
    campaigns.some((c) => c.type.organizationId !== membership.organizationId)
  ) {
    return { error: "Kein Zugriff." };
  }

  await prisma.newsletterCampaign.updateMany({
    where: { id: { in: ids } },
    data: { authorId: author.authorId },
  });
  revalidatePath("/newsletter");
  return { ok: true as const, count: ids.length };
}

const generateCampaignsSchema = z.object({
  typeId: z.string().min(1),
  authorId: z
    .string()
    .trim()
    .transform((v) => (v.length === 0 ? null : v)),
  weeksAhead: z.coerce
    .number()
    .int()
    .refine((n) => [2, 4, 8, 12, 26].includes(n)),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Startdatum ungültig."),
});

export async function generateNewsletterCampaigns(formData: FormData) {
  const { session, membership } = await requireMembership();
  const parsed = generateCampaignsSchema.safeParse({
    typeId: formData.get("typeId"),
    authorId: formData.get("authorId") ?? "",
    weeksAhead: formData.get("weeksAhead"),
    startDate: formData.get("startDate"),
  });
  if (!parsed.success) {
    return { error: "Typ, Startdatum und Zeitraum prüfen." };
  }

  const type = await prisma.newsletterType.findFirst({
    where: {
      id: parsed.data.typeId,
      organizationId: membership.organizationId,
      active: true,
    },
  });
  if (!type) return { error: "Newsletter-Typ nicht gefunden." };
  if (type.weekdays.length === 0) {
    return { error: "Für diesen Typ sind keine Erscheinungstage gesetzt." };
  }

  const author = await resolveOptionalAuthor(
    membership.organizationId,
    parsed.data.authorId,
  );
  if (!author.ok) return { error: author.error };

  const dateKeys = scheduledDateKeysForWeeks(
    type.weekdays,
    parsed.data.weeksAhead,
    parsed.data.startDate,
  );
  if (dateKeys.length === 0) {
    return { error: "Keine Erscheinungstage im gewählten Zeitraum." };
  }

  const dates = dateKeys.map((key) => new Date(`${key}T12:00:00.000Z`));
  const existing = await prisma.newsletterCampaign.findMany({
    where: {
      typeId: type.id,
      date: { in: dates },
    },
    select: { date: true },
  });
  const existingKeys = new Set(
    existing.map((e) => e.date.toISOString().slice(0, 10)),
  );
  const toCreate = dateKeys.filter((key) => !existingKeys.has(key));

  if (toCreate.length > 0) {
    await prisma.newsletterCampaign.createMany({
      data: toCreate.map((key) => ({
        typeId: type.id,
        authorId: author.authorId,
        createdById: session.user.id,
        date: new Date(`${key}T12:00:00.000Z`),
        status: "planned" as const,
      })),
      skipDuplicates: true,
    });
  }

  revalidatePath("/newsletter");
  return {
    ok: true as const,
    created: toCreate.length,
    skippedExisting: dateKeys.length - toCreate.length,
  };
}

const newsletterSlotSchema = z.object({
  typeId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  authorId: z
    .string()
    .trim()
    .transform((v) => (v.length === 0 ? null : v)),
  campaignUrl: z
    .string()
    .trim()
    .transform((v) => (v.length === 0 ? null : v))
    .pipe(z.union([z.null(), z.string().url()])),
  note: z
    .string()
    .trim()
    .max(500)
    .transform((v) => (v.length === 0 ? null : v)),
});

/** Book or update a rhythm slot (author + URL). */
export async function upsertNewsletterSlot(formData: FormData) {
  const { session, membership } = await requireMembership();
  const parsed = newsletterSlotSchema.safeParse({
    typeId: formData.get("typeId"),
    date: formData.get("date"),
    authorId: formData.get("authorId") ?? "",
    campaignUrl: formData.get("campaignUrl") ?? "",
    note: formData.get("note") ?? "",
  });
  if (!parsed.success) {
    return { error: "Bitte Typ, Datum und Link prüfen." };
  }

  const type = await prisma.newsletterType.findFirst({
    where: {
      id: parsed.data.typeId,
      organizationId: membership.organizationId,
      active: true,
    },
  });
  if (!type) return { error: "Newsletter-Typ nicht gefunden." };

  const scheduleError = assertCampaignMatchesSchedule(
    type.weekdays,
    parsed.data.date,
  );
  if (scheduleError) return { error: scheduleError };

  const author = await resolveOptionalAuthor(
    membership.organizationId,
    parsed.data.authorId,
  );
  if (!author.ok) return { error: author.error };

  const status =
    parsed.data.campaignUrl || author.authorId ? "published" : "planned";

  const date = new Date(`${parsed.data.date}T12:00:00.000Z`);
  const existing = await prisma.newsletterCampaign.findFirst({
    where: { typeId: type.id, date },
  });

  if (existing) {
    await prisma.newsletterCampaign.update({
      where: { id: existing.id },
      data: {
        authorId: author.authorId,
        campaignUrl: parsed.data.campaignUrl,
        note: parsed.data.note,
        status,
      },
    });
  } else {
    await prisma.newsletterCampaign.create({
      data: {
        typeId: type.id,
        authorId: author.authorId,
        createdById: session.user.id,
        date,
        campaignUrl: parsed.data.campaignUrl,
        note: parsed.data.note,
        status,
      },
    });
  }

  revalidatePath("/newsletter");
  return { ok: true as const };
}

/** Mark a rhythm slot as skipped (e.g. holiday / Sommerpause). */
export async function skipNewsletterSlot(formData: FormData) {
  const { session, membership } = await requireMembership();
  const typeId = String(formData.get("typeId") ?? "");
  const dateKey = String(formData.get("date") ?? "");
  const noteRaw = String(formData.get("note") ?? "").trim();
  if (!typeId || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    return { error: "Typ und Datum fehlen." };
  }

  const type = await prisma.newsletterType.findFirst({
    where: {
      id: typeId,
      organizationId: membership.organizationId,
      active: true,
    },
  });
  if (!type) return { error: "Newsletter-Typ nicht gefunden." };

  const scheduleError = assertCampaignMatchesSchedule(type.weekdays, dateKey);
  if (scheduleError) return { error: scheduleError };

  const date = new Date(`${dateKey}T12:00:00.000Z`);
  const existing = await prisma.newsletterCampaign.findFirst({
    where: { typeId: type.id, date },
  });
  const note = noteRaw || null;

  if (existing) {
    await prisma.newsletterCampaign.update({
      where: { id: existing.id },
      data: { status: "skipped", note },
    });
  } else {
    await prisma.newsletterCampaign.create({
      data: {
        typeId: type.id,
        createdById: session.user.id,
        date,
        status: "skipped",
        note,
      },
    });
  }

  revalidatePath("/newsletter");
  return { ok: true as const };
}

/** Clear a slot back to open (delete campaign row). */
export async function clearNewsletterSlot(formData: FormData) {
  const { membership } = await requireMembership();
  const typeId = String(formData.get("typeId") ?? "");
  const dateKey = String(formData.get("date") ?? "");
  const campaignId = String(formData.get("id") ?? "");

  if (campaignId) {
    const campaign = await prisma.newsletterCampaign.findUnique({
      where: { id: campaignId },
      include: { type: true },
    });
    if (
      !campaign ||
      campaign.type.organizationId !== membership.organizationId
    ) {
      return { error: "Eintrag nicht gefunden." };
    }
    await prisma.newsletterCampaign.delete({ where: { id: campaign.id } });
    revalidatePath("/newsletter");
    return { ok: true as const };
  }

  if (!typeId || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    return { error: "Typ und Datum fehlen." };
  }

  const type = await prisma.newsletterType.findFirst({
    where: {
      id: typeId,
      organizationId: membership.organizationId,
    },
  });
  if (!type) return { error: "Newsletter-Typ nicht gefunden." };

  await prisma.newsletterCampaign.deleteMany({
    where: {
      typeId: type.id,
      date: new Date(`${dateKey}T12:00:00.000Z`),
    },
  });
  revalidatePath("/newsletter");
  return { ok: true as const };
}

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

// ─── Arbeitszeit ───────────────────────────────────────────────

const upsertTimeEntrySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: z.string(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  breakMinutes: z.coerce.number().int().min(0).max(12 * 60),
  note: z.string().max(500).optional(),
});

function normalizeTimeInput(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const mins = parseTimeToMinutes(value.trim());
  if (mins === null) return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export async function upsertTimeEntry(formData: FormData) {
  const { session, membership } = await requireMembership();
  const parsed = upsertTimeEntrySchema.safeParse({
    date: formData.get("date"),
    type: formData.get("type") || "work",
    startTime: formData.get("startTime") || undefined,
    endTime: formData.get("endTime") || undefined,
    breakMinutes: formData.get("breakMinutes") || 0,
    note: formData.get("note") || undefined,
  });
  if (!parsed.success || !isTimeEntryType(parsed.data.type)) {
    return { error: "Bitte Eintrag prüfen." };
  }

  const type = parsed.data.type;
  const startNorm = normalizeTimeInput(parsed.data.startTime);
  const endNorm = normalizeTimeInput(parsed.data.endTime);
  if (parsed.data.startTime?.trim() && !startNorm) {
    return { error: "Beginn ungültig (HH:MM)." };
  }
  if (parsed.data.endTime?.trim() && !endNorm) {
    return { error: "Schluss ungültig (HH:MM)." };
  }

  if (type === "work") {
    if (!startNorm && endNorm) {
      return { error: "Beginn fehlt." };
    }
    if (startNorm && endNorm) {
      const startM = parseTimeToMinutes(startNorm)!;
      const endM = parseTimeToMinutes(endNorm)!;
      let duration = endM - startM;
      if (duration < 0) duration += 24 * 60;
      if (parsed.data.breakMinutes >= duration) {
        return { error: "Pause ist länger als die Arbeitszeit." };
      }
    }
  }

  const date = new Date(`${parsed.data.date}T12:00:00.000Z`);
  const isAbsent = type === "sick" || type === "vacation" || type === "holiday";

  await prisma.timeEntry.upsert({
    where: {
      organizationId_userId_date: {
        organizationId: membership.organizationId,
        userId: session.user.id,
        date,
      },
    },
    create: {
      organizationId: membership.organizationId,
      userId: session.user.id,
      date,
      type,
      startTime: isAbsent ? null : startNorm,
      endTime: isAbsent ? null : endNorm,
      breakMinutes: isAbsent ? 0 : parsed.data.breakMinutes,
      note: parsed.data.note?.trim() || null,
    },
    update: {
      type,
      startTime: isAbsent ? null : startNorm,
      endTime: isAbsent ? null : endNorm,
      breakMinutes: isAbsent ? 0 : parsed.data.breakMinutes,
      note: parsed.data.note?.trim() || null,
    },
  });

  revalidatePath("/hours");
  revalidatePath("/home");
  return { ok: true as const };
}

export async function deleteTimeEntry(formData: FormData) {
  const { session, membership } = await requireMembership();
  const dateKey = String(formData.get("date") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    return { error: "Ungültiges Datum." };
  }

  await prisma.timeEntry.deleteMany({
    where: {
      organizationId: membership.organizationId,
      userId: session.user.id,
      date: new Date(`${dateKey}T12:00:00.000Z`),
    },
  });

  revalidatePath("/hours");
  revalidatePath("/home");
  return { ok: true as const };
}

const pensumSchema = z.object({
  userId: z.string().min(1),
  pensumPercent: z.coerce.number().int().min(1).max(100),
});

export async function updateMemberPensum(formData: FormData) {
  const { membership } = await requireAdmin();
  const parsed = pensumSchema.safeParse({
    userId: formData.get("userId"),
    pensumPercent: formData.get("pensumPercent"),
  });
  if (!parsed.success) {
    return { error: "Pensum muss zwischen 1 und 100 % liegen." };
  }

  const target = await prisma.membership.findUnique({
    where: {
      organizationId_userId: {
        organizationId: membership.organizationId,
        userId: parsed.data.userId,
      },
    },
  });
  if (!target) return { error: "Person ist nicht im Team." };
  if (target.archivedAt) {
    return { error: "Archivierte Mitglieder können kein Pensum ändern." };
  }

  await prisma.membership.update({
    where: { id: target.id },
    data: { pensumPercent: parsed.data.pensumPercent },
  });

  revalidatePath("/settings/members");
  revalidatePath("/hours");
  revalidatePath("/home");
  const teamInfos = await prisma.space.findFirst({
    where: { organizationId: membership.organizationId, slug: "team-infos" },
    select: { id: true },
  });
  if (teamInfos) revalidatePath(`/spaces/${teamInfos.id}`);
  return { ok: true as const };
}

export async function archiveMember(formData: FormData) {
  const { session, membership } = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  if (!userId) return { error: "Fehlende Person." };

  if (userId === session.user.id) {
    return { error: "Du kannst dich nicht selbst archivieren." };
  }

  const target = await prisma.membership.findUnique({
    where: {
      organizationId_userId: {
        organizationId: membership.organizationId,
        userId,
      },
    },
  });
  if (!target || target.archivedAt) {
    return { error: "Aktives Mitglied nicht gefunden." };
  }

  if (target.role === "admin") {
    const otherAdmins = await prisma.membership.count({
      where: {
        organizationId: membership.organizationId,
        role: "admin",
        archivedAt: null,
        userId: { not: userId },
      },
    });
    if (otherAdmins === 0) {
      return { error: "Der letzte Admin kann nicht archiviert werden." };
    }
  }

  await prisma.membership.update({
    where: { id: target.id },
    data: { archivedAt: new Date() },
  });

  revalidatePath("/settings/members");
  revalidatePath("/settings/hours");
  revalidatePath("/home");
  return { ok: true as const };
}

export async function restoreMember(formData: FormData) {
  const { membership } = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  if (!userId) return { error: "Fehlende Person." };

  const target = await prisma.membership.findUnique({
    where: {
      organizationId_userId: {
        organizationId: membership.organizationId,
        userId,
      },
    },
  });
  if (!target || !target.archivedAt) {
    return { error: "Archiviertes Mitglied nicht gefunden." };
  }

  await prisma.membership.update({
    where: { id: target.id },
    data: { archivedAt: null },
  });

  revalidatePath("/settings/members");
  revalidatePath("/settings/hours");
  revalidatePath("/home");
  return { ok: true as const };
}

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
