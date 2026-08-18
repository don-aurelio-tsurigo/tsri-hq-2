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

export type NavTaskPin = {
  kind: "list" | "project";
  id: string;
  name: string;
};

/** Pinned personal lists and project task buckets for the sidebar. */
export async function listNavTaskPins(
  userId: string,
  organizationId: string,
  limit = 8,
): Promise<NavTaskPin[]> {
  const pins = await prisma.taskInboxPin.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  if (pins.length === 0) return [];

  const listIds = pins.filter((p) => p.kind === "list").map((p) => p.targetId);
  const projectIds = pins
    .filter((p) => p.kind === "project")
    .map((p) => p.targetId);

  const [groups, projects] = await Promise.all([
    listIds.length > 0
      ? prisma.taskGroup.findMany({
          where: {
            id: { in: listIds },
            space: {
              organizationId,
              type: "personal",
              ownerUserId: userId,
            },
          },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    projectIds.length > 0
      ? prisma.space.findMany({
          where: {
            id: { in: projectIds },
            organizationId,
            type: "project",
            isTemplate: false,
            archivedAt: null,
          },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);

  const groupById = new Map(groups.map((g) => [g.id, g.name]));
  const projectById = new Map(projects.map((p) => [p.id, p.name]));

  const resolved: NavTaskPin[] = [];
  for (const pin of pins) {
    if (pin.kind === "list") {
      const name = groupById.get(pin.targetId);
      if (name) resolved.push({ kind: "list", id: pin.targetId, name });
    } else {
      const name = projectById.get(pin.targetId);
      if (name) resolved.push({ kind: "project", id: pin.targetId, name });
    }
  }
  return resolved;
}
