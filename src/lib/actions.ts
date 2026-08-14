"use server";

// Compatibility barrel for `@/lib/actions`.
// Domain logic lives in `./actions/*`; this file only re-exports via thin wrappers
// because "use server" files may only export async functions
// (bare `export { … } from` is rejected by Next.js).

import {
  createInvitation as createInvitationAction,
  acceptInvitation as acceptInvitationAction,
  revokeInvitation as revokeInvitationAction,
  createBootstrapOrganization as createBootstrapOrganizationAction,
} from "./actions/organization";

export async function createInvitation(formData: FormData) {
  return createInvitationAction(formData);
}
export async function acceptInvitation(formData: FormData) {
  return acceptInvitationAction(formData);
}
export async function revokeInvitation(formData: FormData) {
  return revokeInvitationAction(formData);
}
export async function createBootstrapOrganization(
  formData: FormData,
): Promise<void> {
  return createBootstrapOrganizationAction(formData);
}

import {
  createTask as createTaskAction,
  updateTask as updateTaskAction,
  cancelTask as cancelTaskAction,
  deleteTask as deleteTaskAction,
  restoreTask as restoreTaskAction,
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
export async function cancelTask(taskId: string) {
  return cancelTaskAction(taskId);
}
export async function deleteTask(taskId: string) {
  return deleteTaskAction(taskId);
}
export async function restoreTask(taskId: string) {
  return restoreTaskAction(taskId);
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

import {
  refreshNewsFeed as refreshNewsFeedAction,
  updateNewsItemStatusAction as updateNewsItemStatusActionImpl,
  bulkUpdateNewsItemStatusAction as bulkUpdateNewsItemStatusActionImpl,
  generateNewsArticleAction as generateNewsArticleActionImpl,
} from "./actions/news-feed";

export async function refreshNewsFeed() {
  return refreshNewsFeedAction();
}
export async function updateNewsItemStatusAction(id: string, status: string) {
  return updateNewsItemStatusActionImpl(id, status);
}
export async function bulkUpdateNewsItemStatusAction(
  ids: string[],
  status: string,
) {
  return bulkUpdateNewsItemStatusActionImpl(ids, status);
}
export async function generateNewsArticleAction(
  newsItemId: string,
  pastedSourceText?: string,
) {
  return generateNewsArticleActionImpl(newsItemId, pastedSourceText);
}

import {
  createCarouselPost as createCarouselPostAction,
  updateCarouselSlides as updateCarouselSlidesAction,
  deleteCarouselPost as deleteCarouselPostAction,
  importCarouselFromArticleUrl as importCarouselFromArticleUrlAction,
} from "./actions/carousel";

export async function createCarouselPost(
  title?: string | FormData,
  format?: string,
) {
  return createCarouselPostAction(title, format);
}
export async function updateCarouselSlides(
  id: string,
  slides: unknown,
  title?: string,
) {
  return updateCarouselSlidesAction(id, slides, title);
}
export async function deleteCarouselPost(formData: FormData) {
  return deleteCarouselPostAction(formData);
}
export async function importCarouselFromArticleUrl(
  articleUrl: string,
  format?: string,
) {
  return importCarouselFromArticleUrlAction(articleUrl, format);
}

import {
  createAdCampaign as createAdCampaignAction,
  toggleAdCampaignStatus as toggleAdCampaignStatusAction,
  updateAdCampaign as updateAdCampaignAction,
} from "./actions/ads";

export async function createAdCampaign(formData: FormData) {
  return createAdCampaignAction(formData);
}
export async function toggleAdCampaignStatus(formData: FormData) {
  return toggleAdCampaignStatusAction(formData);
}
export async function updateAdCampaign(formData: FormData) {
  return updateAdCampaignAction(formData);
}
