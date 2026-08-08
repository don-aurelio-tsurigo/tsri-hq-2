"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { hashPassword } from "better-auth/crypto";
import { prisma } from "@/lib/db";
import { requireAdmin, requireMembership, requireSession } from "@/lib/session";
import { ensurePersonalSpace } from "@/lib/spaces";

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

// Re-export via thin wrappers: "use server" files may only export async functions
// (bare `export { … } from` is rejected by Next.js).
import {
  createTask as createTaskAction,
  updateTask as updateTaskAction,
  createTaskGroup as createTaskGroupAction,
  updateTaskGroup as updateTaskGroupAction,
  deleteTaskGroup as deleteTaskGroupAction,
} from "./actions/tasks";

export async function createTask(formData: FormData) {
  return createTaskAction(formData);
}
export async function updateTask(formData: FormData) {
  return updateTaskAction(formData);
}
export async function createTaskGroup(formData: FormData) {
  return createTaskGroupAction(formData);
}
export async function updateTaskGroup(formData: FormData) {
  return updateTaskGroupAction(formData);
}
export async function deleteTaskGroup(formData: FormData) {
  return deleteTaskGroupAction(formData);
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

