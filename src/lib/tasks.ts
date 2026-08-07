import { prisma } from "@/lib/db";
import { toDateKey } from "@/lib/cooking";
import { getPersonalSpace } from "@/lib/spaces";
import type { TaskStatus } from "@/generated/prisma/client";
import {
  ARTICLE_STAGES,
  ARTICLE_STAGE_LABELS,
  type ArticleStage,
} from "@/lib/editorial";

export type InboxTask = Awaited<ReturnType<typeof getInboxTasks>>[number];
export type SpaceTask = Awaited<ReturnType<typeof listSpaceTasks>>[number];
export type ArticleTask = Awaited<ReturnType<typeof listArticles>>[number];

/**
 * Current items for Home dashboard: private + assigned open work
 * (not done / not cancelled). Articles exclude terminal stages.
 */
export async function getCurrentDashboardItems(
  organizationId: string,
  userId: string,
) {
  const personal = await getPersonalSpace(organizationId, userId);
  const items = await prisma.task.findMany({
    where: {
      status: { in: ["todo", "doing"] },
      space: { organizationId },
      OR: [
        ...(personal ? [{ spaceId: personal.id }] : []),
        {
          assigneeId: userId,
          space: {
            type: { not: "personal" as const },
            isTemplate: false,
            archivedAt: null,
          },
        },
        {
          assignments: { some: { userId } },
          space: {
            type: { not: "personal" as const },
            isTemplate: false,
            archivedAt: null,
          },
        },
      ],
      NOT: {
        kind: "article",
        stage: { in: ["publiziert", "abgelehnt"] },
      },
      archivedAt: null,
    },
    include: {
      space: true,
      assignee: { select: { id: true, name: true, email: true } },
    },
    orderBy: [{ dueAt: "asc" }, { updatedAt: "desc" }],
  });
  return items;
}

/**
 * Inbox = private tasks in personal space + tasks assigned to the user
 * in any team/project space (excludes cancelled).
 */
export async function getInboxTasks(organizationId: string, userId: string) {
  return getCurrentDashboardItems(organizationId, userId);
}

export async function listSpaceTasks(spaceId: string) {
  return prisma.task.findMany({
    where: { spaceId, status: { not: "cancelled" } },
    include: {
      assignee: { select: { id: true, name: true, email: true } },
      createdBy: { select: { id: true, name: true } },
      group: { select: { id: true, name: true, sortOrder: true } },
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  });
}

export async function listTaskGroups(spaceId: string) {
  return prisma.taskGroup.findMany({
    where: { spaceId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

/** Open project tasks assigned to a user (across all active projects in the org). */
export async function listAssignedProjectTasks(
  organizationId: string,
  userId: string,
) {
  return prisma.task.findMany({
    where: {
      status: { in: ["todo", "doing"] },
      assigneeId: userId,
      kind: "generic",
      space: {
        organizationId,
        type: "project",
        isTemplate: false,
        archivedAt: null,
      },
    },
    include: {
      space: { select: { id: true, name: true, type: true } },
      assignee: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
      group: { select: { id: true, name: true } },
    },
    orderBy: [{ dueAt: "asc" }, { updatedAt: "desc" }],
  });
}

/** All non-cancelled articles (full editorial database, incl. published + soft-archived). */
export async function listArticles(spaceId: string) {
  return prisma.task.findMany({
    where: {
      spaceId,
      kind: "article",
      status: { not: "cancelled" },
    },
    include: {
      assignee: { select: { id: true, name: true, email: true } },
      createdBy: { select: { id: true, name: true } },
      eigenleistungRubrik: {
        select: { id: true, name: true, color: true },
      },
      category: {
        select: { id: true, name: true, color: true, active: true },
      },
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
  });
}

const MY_HOME_ARTICLE_STAGES = [
  "weiter",
  "in_arbeit",
  "bereit",
  "publiziert",
] as const;

/**
 * Home "Meine Artikel": assigned, stage ab Weiter (ohne Input/Warteliste/Abgelehnt),
 * mit Publikationsdatum ab heute.
 */
export async function listMyHomeArticles(
  organizationId: string,
  userId: string,
) {
  const todayKey = toDateKey(new Date());
  const dayStart = new Date(`${todayKey}T00:00:00.000Z`);

  return prisma.task.findMany({
    where: {
      kind: "article",
      status: { not: "cancelled" },
      archivedAt: null,
      stage: { in: [...MY_HOME_ARTICLE_STAGES] },
      publishAt: { gte: dayStart },
      space: {
        organizationId,
        type: { not: "personal" },
        isTemplate: false,
        archivedAt: null,
      },
      OR: [
        { assigneeId: userId },
        { assignments: { some: { userId } } },
      ],
    },
    include: {
      space: true,
      assignee: { select: { id: true, name: true, email: true } },
    },
    orderBy: [{ publishAt: "asc" }, { updatedAt: "desc" }],
  });
}

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "Offen",
  doing: "In Arbeit",
  done: "Erledigt",
  cancelled: "Abgebrochen",
};

export { ARTICLE_STAGES, ARTICLE_STAGE_LABELS };
export type { ArticleStage };
