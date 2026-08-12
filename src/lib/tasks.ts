import { prisma } from "@/lib/db";
import type { TaskStatus } from "@/generated/prisma/client";
import { ensurePersonalSpace, getPersonalSpace } from "@/lib/spaces";

export type InboxTask = Awaited<ReturnType<typeof getInboxTasks>>[number];
export type SpaceTask = Awaited<ReturnType<typeof listSpaceTasks>>[number];

/**
 * Current items for Home dashboard: private + assigned open work
 * (not done / not cancelled). Articles live on a separate model.
 */
export async function getCurrentDashboardItems(
  organizationId: string,
  userId: string,
  userName?: string,
) {
  const personal = userName
    ? await ensurePersonalSpace(organizationId, userId, userName)
    : await getPersonalSpace(organizationId, userId);
  return prisma.task.findMany({
    where: {
      archivedAt: null,
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
      ],
    },
    include: {
      space: true,
      assignee: { select: { id: true, name: true, email: true } },
    },
    orderBy: [{ dueAt: "asc" }, { updatedAt: "desc" }],
  });
}

/**
 * Inbox = private tasks in personal space + tasks assigned to the user
 * in any team/project space (excludes cancelled).
 */
export async function getInboxTasks(
  organizationId: string,
  userId: string,
  userName?: string,
) {
  return getCurrentDashboardItems(organizationId, userId, userName);
}

export async function listSpaceTasks(spaceId: string) {
  return prisma.task.findMany({
    where: { spaceId, archivedAt: null },
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
      archivedAt: null,
      status: { in: ["todo", "doing"] },
      assigneeId: userId,
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

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "Offen",
  doing: "In Arbeit",
  done: "Erledigt",
  cancelled: "Abgebrochen",
};
