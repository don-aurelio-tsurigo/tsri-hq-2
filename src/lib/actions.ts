"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { hashPassword } from "better-auth/crypto";
import { prisma } from "@/lib/db";
import { requireAdmin, requireMembership, requireSession } from "@/lib/session";
import { ensurePersonalSpace } from "@/lib/spaces";
import { canEditSpace, canViewSpace } from "@/lib/permissions";

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

// Re-export via thin wrappers: "use server" files may only export async functions
// (bare `export { … } from` is rejected by Next.js).
import {
  createArticle as createArticleAction,
  updateArticle as updateArticleAction,
  moveArticleStage as moveArticleStageAction,
  setArticlePublishAt as setArticlePublishAtAction,
  archiveArticle as archiveArticleAction,
  unarchiveArticle as unarchiveArticleAction,
  deleteArticle as deleteArticleAction,
} from "./actions/articles";

export async function createArticle(formData: FormData) {
  return createArticleAction(formData);
}
export async function updateArticle(formData: FormData) {
  return updateArticleAction(formData);
}
export async function moveArticleStage(formData: FormData) {
  return moveArticleStageAction(formData);
}
export async function setArticlePublishAt(formData: FormData) {
  return setArticlePublishAtAction(formData);
}
export async function archiveArticle(formData: FormData) {
  return archiveArticleAction(formData);
}
export async function unarchiveArticle(formData: FormData) {
  return unarchiveArticleAction(formData);
}
export async function deleteArticle(formData: FormData) {
  return deleteArticleAction(formData);
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

// Re-export via thin wrappers: "use server" files may only export async functions
// (bare `export { … } from` is rejected by Next.js).
import {
  createNewsletterType as createNewsletterTypeAction,
  updateNewsletterType as updateNewsletterTypeAction,
  deleteNewsletterType as deleteNewsletterTypeAction,
  updateNewsletterHideHolidays as updateNewsletterHideHolidaysAction,
  createNewsletterBlockedRange as createNewsletterBlockedRangeAction,
  deleteNewsletterBlockedRange as deleteNewsletterBlockedRangeAction,
  createNewsletterCampaign as createNewsletterCampaignAction,
  updateNewsletterCampaign as updateNewsletterCampaignAction,
  deleteNewsletterCampaign as deleteNewsletterCampaignAction,
  bulkDeleteNewsletterCampaigns as bulkDeleteNewsletterCampaignsAction,
  bulkAssignNewsletterCampaignAuthor as bulkAssignNewsletterCampaignAuthorAction,
  generateNewsletterCampaigns as generateNewsletterCampaignsAction,
  upsertNewsletterSlot as upsertNewsletterSlotAction,
  skipNewsletterSlot as skipNewsletterSlotAction,
  clearNewsletterSlot as clearNewsletterSlotAction,
} from "./actions/newsletter";

export async function createNewsletterType(formData: FormData) {
  return createNewsletterTypeAction(formData);
}
export async function updateNewsletterType(formData: FormData) {
  return updateNewsletterTypeAction(formData);
}
export async function deleteNewsletterType(formData: FormData) {
  return deleteNewsletterTypeAction(formData);
}
export async function updateNewsletterHideHolidays(formData: FormData) {
  return updateNewsletterHideHolidaysAction(formData);
}
export async function createNewsletterBlockedRange(formData: FormData) {
  return createNewsletterBlockedRangeAction(formData);
}
export async function deleteNewsletterBlockedRange(formData: FormData) {
  return deleteNewsletterBlockedRangeAction(formData);
}
export async function createNewsletterCampaign(formData: FormData) {
  return createNewsletterCampaignAction(formData);
}
export async function updateNewsletterCampaign(formData: FormData) {
  return updateNewsletterCampaignAction(formData);
}
export async function deleteNewsletterCampaign(formData: FormData) {
  return deleteNewsletterCampaignAction(formData);
}
export async function bulkDeleteNewsletterCampaigns(formData: FormData) {
  return bulkDeleteNewsletterCampaignsAction(formData);
}
export async function bulkAssignNewsletterCampaignAuthor(formData: FormData) {
  return bulkAssignNewsletterCampaignAuthorAction(formData);
}
export async function generateNewsletterCampaigns(formData: FormData) {
  return generateNewsletterCampaignsAction(formData);
}
export async function upsertNewsletterSlot(formData: FormData) {
  return upsertNewsletterSlotAction(formData);
}
export async function skipNewsletterSlot(formData: FormData) {
  return skipNewsletterSlotAction(formData);
}
export async function clearNewsletterSlot(formData: FormData) {
  return clearNewsletterSlotAction(formData);
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

