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

const articleCreateSchema = z.object({
  spaceId: z.string().min(1),
  title: z.string().min(1).max(200),
  description: z.string().max(50000).optional(),
  assigneeId: z.string().optional(),
  categoryId: z.string().optional(),
  stage: z.string().optional(),
  eigenleistungRubrikId: z.string().optional(),
  publishAt: z.string().optional(),
});

export async function createArticle(formData: FormData) {
  const { session, membership } = await requireMembership();
  const parsed = articleCreateSchema.safeParse({
    spaceId: formData.get("spaceId"),
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    assigneeId: formData.get("assigneeId") || undefined,
    categoryId: formData.has("categoryId")
      ? String(formData.get("categoryId") ?? "")
      : undefined,
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

  let assigneeId: string | null = session.user.id;
  if (parsed.data.assigneeId && parsed.data.assigneeId.length > 0) {
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

  let categoryId: string | null | undefined;
  if (parsed.data.categoryId !== undefined) {
    if (parsed.data.categoryId === "") {
      categoryId = null;
    } else {
      const cat = await prisma.articleCategory.findFirst({
        where: {
          id: parsed.data.categoryId,
          organizationId: membership.organizationId,
          active: true,
        },
      });
      if (!cat) return { error: "Ungültige Kategorie." };
      categoryId = cat.id;
    }
  }

  let eigenleistungRubrikId: string | null | undefined;
  if (parsed.data.eigenleistungRubrikId !== undefined) {
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

  const stage = isArticleStage(parsed.data.stage)
    ? parsed.data.stage
    : DEFAULT_ARTICLE_STAGE;

  let publishAt: Date | null | undefined;
  if (parsed.data.publishAt !== undefined) {
    const raw = parsed.data.publishAt.trim();
    if (raw !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      return { error: "Ungültiges Publikationsdatum." };
    }
    publishAt = raw ? new Date(`${raw}T12:00:00.000Z`) : null;
  }

  await prisma.article.create({
    data: {
      spaceId: space.id,
      title: parsed.data.title.trim(),
      description: parsed.data.description?.trim() || null,
      stage,
      assigneeId,
      createdById: session.user.id,
      ...(categoryId !== undefined ? { categoryId } : {}),
      ...(eigenleistungRubrikId !== undefined
        ? { eigenleistungRubrikId }
        : {}),
      ...(publishAt !== undefined ? { publishAt } : {}),
    },
  });

  revalidatePath("/home");
  revalidatePath(`/spaces/${space.id}`);
  revalidatePath(`/projects/${space.id}`);
  revalidatePath("/programm");

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

const articleUpdateSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(50000).optional(),
  publishAt: z.string().optional(),
  stage: z.string().optional(),
  categoryId: z.string().optional(),
  eigenleistungRubrikId: z.string().optional(),
  assigneeId: z.string().optional(),
  clearCategory: z.string().optional(),
});

export async function updateArticle(formData: FormData) {
  const { session, membership } = await requireMembership();
  const parsed = articleUpdateSchema.safeParse({
    id: formData.get("id"),
    title: formData.get("title") || undefined,
    description:
      formData.get("description") === null
        ? undefined
        : formData.has("description")
          ? String(formData.get("description") ?? "")
          : undefined,
    publishAt: formData.has("publishAt")
      ? String(formData.get("publishAt") ?? "")
      : undefined,
    stage: formData.get("stage") || undefined,
    categoryId: formData.has("categoryId")
      ? String(formData.get("categoryId") ?? "")
      : undefined,
    eigenleistungRubrikId: formData.has("eigenleistungRubrikId")
      ? String(formData.get("eigenleistungRubrikId") ?? "")
      : undefined,
    assigneeId: formData.has("assigneeId")
      ? String(formData.get("assigneeId") ?? "")
      : undefined,
    clearCategory: formData.get("clearCategory") || undefined,
  });
  if (!parsed.success) {
    return { error: "Ungültige Artikel-Daten." };
  }

  const article = await prisma.article.findUnique({
    where: { id: parsed.data.id },
    include: { space: { include: { access: true } } },
  });
  if (!article || !canViewSpace(session.user, article.space, membership)) {
    return { error: "Artikel nicht gefunden." };
  }
  if (!canEditSpace(session.user, article.space, membership)) {
    return { error: "Keine Berechtigung." };
  }

  const stage = isArticleStage(parsed.data.stage) ? parsed.data.stage : undefined;

  const data: {
    title?: string;
    description?: string | null;
    publishAt?: Date | null;
    stage?: typeof stage;
    categoryId?: string | null;
    eigenleistungRubrikId?: string | null;
    assigneeId?: string | null;
  } = {};

  if (parsed.data.title) data.title = parsed.data.title.trim();
  if (parsed.data.description !== undefined) {
    data.description = parsed.data.description.trim() || null;
  }
  if (parsed.data.publishAt !== undefined) {
    const raw = parsed.data.publishAt.trim();
    if (raw !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      return { error: "Ungültiges Publikationsdatum." };
    }
    data.publishAt = raw ? new Date(`${raw}T12:00:00.000Z`) : null;
  }
  if (stage) data.stage = stage;

  if (parsed.data.clearCategory === "1") {
    data.categoryId = null;
  } else if (parsed.data.categoryId !== undefined) {
    if (parsed.data.categoryId === "") {
      data.categoryId = null;
    } else {
      const cat = await prisma.articleCategory.findFirst({
        where: {
          id: parsed.data.categoryId,
          organizationId: membership.organizationId,
        },
      });
      if (!cat) return { error: "Ungültige Kategorie." };
      data.categoryId = cat.id;
    }
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

  if (parsed.data.assigneeId !== undefined) {
    const nextAssignee =
      parsed.data.assigneeId === "" ? null : parsed.data.assigneeId;
    if (nextAssignee) {
      const member = await prisma.membership.findUnique({
        where: {
          organizationId_userId: {
            organizationId: membership.organizationId,
            userId: nextAssignee,
          },
        },
      });
      if (!member) return { error: "Person nicht im Team." };
    }
    data.assigneeId = nextAssignee;
  }

  await prisma.article.update({
    where: { id: article.id },
    data,
  });

  revalidatePath("/home");
  revalidatePath(`/spaces/${article.spaceId}`);
  revalidatePath("/programm");
  return { ok: true as const };
}

export async function moveArticleStage(formData: FormData) {
  const stage = String(formData.get("stage") ?? "");
  if (!isArticleStage(stage)) {
    return { error: "Ungültige Stage." };
  }
  formData.set("stage", stage);
  return updateArticle(formData);
}

export async function setArticlePublishAt(formData: FormData) {
  const { session, membership } = await requireMembership();
  const id = String(formData.get("id") ?? "");
  const raw = String(formData.get("publishAt") ?? "").trim();
  if (!id) return { error: "Fehlende ID." };
  if (raw !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return { error: "Ungültiges Datum." };
  }

  const article = await prisma.article.findUnique({
    where: { id },
    include: { space: { include: { access: true } } },
  });
  if (!article || !canEditSpace(session.user, article.space, membership)) {
    return { error: "Kein Zugriff." };
  }

  await prisma.article.update({
    where: { id },
    data: {
      publishAt: raw ? new Date(`${raw}T12:00:00.000Z`) : null,
    },
  });

  revalidatePath("/programm");
  revalidatePath(`/spaces/${article.spaceId}`);
  revalidatePath(`/projects/${article.spaceId}`);
  revalidatePath("/home");
  return { ok: true as const };
}

async function loadEditableArticle(id: string) {
  const { session, membership } = await requireMembership();
  const article = await prisma.article.findUnique({
    where: { id },
    include: { space: { include: { access: true } } },
  });
  if (!article || !canEditSpace(session.user, article.space, membership)) {
    return { error: "Kein Zugriff." as const };
  }
  return { article, session, membership };
}

export async function archiveArticle(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Fehlende ID." };
  const loaded = await loadEditableArticle(id);
  if ("error" in loaded) return loaded;

  await prisma.article.update({
    where: { id },
    data: { archivedAt: new Date() },
  });

  revalidatePath("/programm");
  revalidatePath(`/spaces/${loaded.article.spaceId}`);
  revalidatePath(`/projects/${loaded.article.spaceId}`);
  revalidatePath("/home");
  return { ok: true as const };
}

export async function unarchiveArticle(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Fehlende ID." };
  const loaded = await loadEditableArticle(id);
  if ("error" in loaded) return loaded;

  await prisma.article.update({
    where: { id },
    data: { archivedAt: null },
  });

  revalidatePath("/programm");
  revalidatePath(`/spaces/${loaded.article.spaceId}`);
  revalidatePath(`/projects/${loaded.article.spaceId}`);
  revalidatePath("/home");
  return { ok: true as const };
}

export async function deleteArticle(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Fehlende ID." };
  const loaded = await loadEditableArticle(id);
  if ("error" in loaded) return loaded;

  await prisma.article.delete({ where: { id } });

  revalidatePath("/programm");
  revalidatePath(`/spaces/${loaded.article.spaceId}`);
  revalidatePath(`/projects/${loaded.article.spaceId}`);
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

// Re-export via thin wrappers: "use server" files may only export async functions
// (bare `export { … } from` is rejected by Next.js).
import {
  createProject as createProjectAction,
  archiveProject as archiveProjectAction,
  unarchiveProject as unarchiveProjectAction,
  saveProjectAsTemplate as saveProjectAsTemplateAction,
  updateProjectEventMeta as updateProjectEventMetaAction,
  deleteProjectTemplate as deleteProjectTemplateAction,
  updateProjectNotes as updateProjectNotesAction,
} from "./actions/projects";

export async function createProject(formData: FormData) {
  return createProjectAction(formData);
}
export async function archiveProject(formData: FormData) {
  return archiveProjectAction(formData);
}
export async function unarchiveProject(formData: FormData) {
  return unarchiveProjectAction(formData);
}
export async function saveProjectAsTemplate(formData: FormData) {
  return saveProjectAsTemplateAction(formData);
}
export async function updateProjectEventMeta(formData: FormData) {
  return updateProjectEventMetaAction(formData);
}
export async function deleteProjectTemplate(formData: FormData) {
  return deleteProjectTemplateAction(formData);
}
export async function updateProjectNotes(formData: FormData) {
  return updateProjectNotesAction(formData);
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

  const name = String(formData.get("name") ?? "").trim() || "Tsüri-Team";
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

  const { ensureWikiStarterPages } = await import("@/lib/wiki");
  await ensureWikiStarterPages(org.id, session.user.id);

  redirect("/home");
}

// Re-export via thin wrappers: "use server" files may only export async functions
// (bare `export { … } from` is rejected by Next.js).
import {
  updatePrivateNotes as updatePrivateNotesAction,
  updateMemberProfile as updateMemberProfileAction,
  updateMemberPensum as updateMemberPensumAction,
  archiveMember as archiveMemberAction,
  restoreMember as restoreMemberAction,
  adminSetMemberPassword as adminSetMemberPasswordAction,
  adminCreatePasswordResetLink as adminCreatePasswordResetLinkAction,
  resetPasswordWithToken as resetPasswordWithTokenAction,
} from "./actions/members";

export async function updatePrivateNotes(formData: FormData) {
  return updatePrivateNotesAction(formData);
}

export async function updateMemberProfile(formData: FormData) {
  return updateMemberProfileAction(formData);
}

// Re-export via thin wrappers: "use server" files may only export async functions
// (bare `export { … } from` is rejected by Next.js).
import {
  createChore as createChoreAction,
  updateChore as updateChoreAction,
  deleteChore as deleteChoreAction,
  setChoreAssignees as setChoreAssigneesAction,
  setCookingSlot as setCookingSlotAction,
  clearCookingSlot as clearCookingSlotAction,
  updateSlackCookingNotificationSettings as updateSlackCookingNotificationSettingsAction,
} from "./actions/chores";

export async function createChore(formData: FormData) {
  return createChoreAction(formData);
}
export async function updateChore(formData: FormData) {
  return updateChoreAction(formData);
}
export async function deleteChore(formData: FormData) {
  return deleteChoreAction(formData);
}
export async function setChoreAssignees(formData: FormData) {
  return setChoreAssigneesAction(formData);
}
export async function setCookingSlot(formData: FormData) {
  return setCookingSlotAction(formData);
}
export async function clearCookingSlot(formData: FormData) {
  return clearCookingSlotAction(formData);
}
export async function updateSlackCookingNotificationSettings(
  formData: FormData,
) {
  return updateSlackCookingNotificationSettingsAction(formData);
}

const newsletterTypeSchema = z.object({
  name: z.string().trim().min(1).max(120),
  weekdays: z
    .array(z.coerce.number().int().min(1).max(7))
    .min(1, "Mindestens ein Wochentag")
    .transform((days) => [...new Set(days)].sort((a, b) => a - b)),
  requiresWordle: z
    .union([z.literal("true"), z.literal("on"), z.literal("false"), z.null()])
    .optional()
    .transform((v) => v === "true" || v === "on"),
});

function parseNewsletterTypeForm(formData: FormData) {
  return newsletterTypeSchema.safeParse({
    name: formData.get("name"),
    weekdays: formData.getAll("weekdays"),
    requiresWordle: formData.get("requiresWordle") ?? null,
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
          requiresWordle: parsed.data.requiresWordle,
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
      requiresWordle: parsed.data.requiresWordle,
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
      requiresWordle: parsed.data.requiresWordle,
    },
  });

  revalidatePath("/settings/newsletter");
  revalidatePath("/newsletter");
  return { ok: true as const };
}

/** Soft-delete: Typ wird ausgeblendet, Campaigns bleiben erhalten. */
export async function deleteNewsletterType(formData: FormData) {
  const { membership } = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Fehlende ID." };

  const type = await prisma.newsletterType.findFirst({
    where: {
      id,
      organizationId: membership.organizationId,
      active: true,
    },
  });
  if (!type) return { error: "Typ nicht gefunden." };

  await prisma.newsletterType.update({
    where: { id },
    data: { active: false },
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
  newsletterTypeId: z.string().min(1),
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
    newsletterTypeId: formData.get("newsletterTypeId"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    label: formData.get("label") ?? "",
  });
  if (!parsed.success) {
    return { error: "Bitte Newsletter-Typ sowie Start- und Enddatum prüfen." };
  }
  if (parsed.data.endDate < parsed.data.startDate) {
    return { error: "Enddatum muss nach dem Startdatum liegen." };
  }

  const type = await prisma.newsletterType.findFirst({
    where: {
      id: parsed.data.newsletterTypeId,
      organizationId: membership.organizationId,
      active: true,
    },
  });
  if (!type) return { error: "Newsletter-Typ nicht gefunden." };

  await prisma.newsletterBlockedRange.create({
    data: {
      organizationId: membership.organizationId,
      newsletterTypeId: type.id,
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
  wordleWord: z
    .string()
    .trim()
    .transform((v) => (v.length === 0 ? null : v.toLocaleUpperCase("de-CH")))
    .pipe(
      z.union([
        z.null(),
        z
          .string()
          .regex(
            /^[A-ZÄÖÜ]{5}$/,
            "Wordle-Wort muss genau 5 Buchstaben sein",
          ),
      ]),
    ),
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
    wordleWord: formData.get("wordleWord") ?? "",
  });
  if (!parsed.success) {
    return { error: "Bitte Typ, Datum und Wordle-Wort prüfen." };
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
      wordleWord: parsed.data.wordleWord,
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
    wordleWord: formData.get("wordleWord") ?? "",
  });
  if (!parsed.success) {
    return { error: "Bitte Typ, Datum und Wordle-Wort prüfen." };
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
      wordleWord: parsed.data.wordleWord,
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
  wordleWord: z
    .string()
    .trim()
    .transform((v) => (v.length === 0 ? null : v.toLocaleUpperCase("de-CH")))
    .pipe(
      z.union([
        z.null(),
        z
          .string()
          .regex(
            /^[A-ZÄÖÜ]{5}$/,
            "Wordle-Wort muss genau 5 Buchstaben sein",
          ),
      ]),
    ),
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
    wordleWord: formData.get("wordleWord") ?? "",
  });
  if (!parsed.success) {
    return { error: "Bitte Typ, Datum, Link und Wordle-Wort prüfen." };
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

  // Ignore wordle when type does not use it
  const wordleWord = type.requiresWordle ? parsed.data.wordleWord : null;

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
        wordleWord,
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
        wordleWord,
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

// Re-export via thin wrappers: "use server" files may only export async functions
// (bare `export { … } from` is rejected by Next.js).
import {
  createVacationRequest as createVacationRequestAction,
  updateVacationRequest as updateVacationRequestAction,
  reviewVacationRequest as reviewVacationRequestAction,
  cancelVacationRequest as cancelVacationRequestAction,
} from "./actions/vacation";

export async function createVacationRequest(formData: FormData) {
  return createVacationRequestAction(formData);
}
export async function updateVacationRequest(formData: FormData) {
  return updateVacationRequestAction(formData);
}
export async function reviewVacationRequest(formData: FormData) {
  return reviewVacationRequestAction(formData);
}
export async function cancelVacationRequest(formData: FormData) {
  return cancelVacationRequestAction(formData);
}

// Re-export via thin wrappers: "use server" files may only export async functions
// (bare `export { … } from` is rejected by Next.js).
import {
  upsertTimeEntry as upsertTimeEntryAction,
  deleteTimeEntry as deleteTimeEntryAction,
} from "./actions/time-tracking";

export async function upsertTimeEntry(formData: FormData) {
  return upsertTimeEntryAction(formData);
}
export async function deleteTimeEntry(formData: FormData) {
  return deleteTimeEntryAction(formData);
}

export async function updateMemberPensum(formData: FormData) {
  return updateMemberPensumAction(formData);
}
export async function archiveMember(formData: FormData) {
  return archiveMemberAction(formData);
}
export async function restoreMember(formData: FormData) {
  return restoreMemberAction(formData);
}
export async function adminSetMemberPassword(formData: FormData) {
  return adminSetMemberPasswordAction(formData);
}
export async function adminCreatePasswordResetLink(formData: FormData) {
  return adminCreatePasswordResetLinkAction(formData);
}
export async function resetPasswordWithToken(formData: FormData) {
  return resetPasswordWithTokenAction(formData);
}

// Re-export via thin wrappers: "use server" files may only export async functions
// (bare `export { … } from` is rejected by Next.js).
import {
  createEigenleistungRubrik as createEigenleistungRubrikAction,
  updateEigenleistungRubrik as updateEigenleistungRubrikAction,
  deleteEigenleistungRubrik as deleteEigenleistungRubrikAction,
  createArticleCategory as createArticleCategoryAction,
  updateArticleCategory as updateArticleCategoryAction,
  deleteArticleCategory as deleteArticleCategoryAction,
} from "./actions/taxonomy";

export async function createEigenleistungRubrik(formData: FormData) {
  return createEigenleistungRubrikAction(formData);
}
export async function updateEigenleistungRubrik(formData: FormData) {
  return updateEigenleistungRubrikAction(formData);
}
export async function deleteEigenleistungRubrik(formData: FormData) {
  return deleteEigenleistungRubrikAction(formData);
}
export async function createArticleCategory(formData: FormData) {
  return createArticleCategoryAction(formData);
}
export async function updateArticleCategory(formData: FormData) {
  return updateArticleCategoryAction(formData);
}
export async function deleteArticleCategory(formData: FormData) {
  return deleteArticleCategoryAction(formData);
}

// Re-export via thin wrappers: "use server" files may only export async functions
// (bare `export { … } from` is rejected by Next.js).
import {
  refreshNewsFeed as refreshNewsFeedAction,
  updateNewsItemStatusAction as updateNewsItemStatusActionImpl,
  bulkUpdateNewsItemStatusAction as bulkUpdateNewsItemStatusActionImpl,
} from "./actions/news-feed";

export async function refreshNewsFeed() {
  return refreshNewsFeedAction();
}
export async function updateNewsItemStatusAction(
  id: string,
  status: string,
) {
  return updateNewsItemStatusActionImpl(id, status);
}
export async function bulkUpdateNewsItemStatusAction(
  ids: string[],
  status: string,
) {
  return bulkUpdateNewsItemStatusActionImpl(ids, status);
}

