import { prisma } from "@/lib/db";
import { dueAtFromEvent, offsetFromEvent } from "@/lib/project-meta";

export {
  dueAtFromEvent,
  offsetFromEvent,
  toDateInputValue,
  isProjectEvent,
  eventCountdownLabel,
} from "@/lib/project-meta";

function slugify(input: string) {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export async function uniqueProjectSlug(organizationId: string, name: string) {
  const base = slugify(name) || "projekt";
  let slug = base;
  let i = 2;
  while (
    await prisma.space.findUnique({
      where: { organizationId_slug: { organizationId, slug } },
    })
  ) {
    slug = `${base}-${i}`;
    i += 1;
  }
  return slug;
}

const projectInclude = {
  owner: { select: { id: true, name: true } },
  _count: {
    select: {
      tasks: {
        where: {
          archivedAt: null,
          status: { not: "cancelled" as const },
        },
      },
    },
  },
} as const;

/** Active (non-archived, non-template) projects */
export async function listProjects(organizationId: string) {
  return prisma.space.findMany({
    where: {
      organizationId,
      type: "project",
      isTemplate: false,
      archivedAt: null,
    },
    include: projectInclude,
    orderBy: [{ eventAt: "asc" }, { updatedAt: "desc" }],
  });
}

export async function listArchivedProjects(organizationId: string) {
  return prisma.space.findMany({
    where: {
      organizationId,
      type: "project",
      isTemplate: false,
      archivedAt: { not: null },
    },
    include: projectInclude,
    orderBy: { archivedAt: "desc" },
  });
}

export async function listProjectTemplates(organizationId: string) {
  return prisma.space.findMany({
    where: {
      organizationId,
      type: "project",
      isTemplate: true,
      archivedAt: null,
    },
    include: projectInclude,
    orderBy: { name: "asc" },
  });
}

export async function getProject(organizationId: string, projectId: string) {
  return prisma.space.findFirst({
    where: {
      id: projectId,
      organizationId,
      type: "project",
    },
    include: {
      owner: { select: { id: true, name: true } },
      access: true,
    },
  });
}

export async function countOpenTasks(projectId: string) {
  return prisma.task.count({
    where: {
      spaceId: projectId,
      archivedAt: null,
      status: { in: ["todo", "doing"] },
    },
  });
}

/**
 * Copy task groups + generic tasks into a target project.
 * Preserves dueOffsetDays; when eventAt is set, also derives dueAt.
 * When source has eventAt and tasks have dueAt but no offset, offsets are inferred.
 */
export async function copyProjectStructure(
  sourceProjectId: string,
  targetProjectId: string,
  createdById: string,
  options?: { eventAt?: Date | null },
) {
  const source = await prisma.space.findUnique({
    where: { id: sourceProjectId },
    select: { eventAt: true },
  });

  const sourceGroups = await prisma.taskGroup.findMany({
    where: { spaceId: sourceProjectId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  const groupIdMap = new Map<string, string>();
  for (const group of sourceGroups) {
    const created = await prisma.taskGroup.create({
      data: {
        spaceId: targetProjectId,
        name: group.name,
        sortOrder: group.sortOrder,
      },
    });
    groupIdMap.set(group.id, created.id);
  }

  const sourceTasks = await prisma.task.findMany({
    where: {
      spaceId: sourceProjectId,
      archivedAt: null,
      status: { not: "cancelled" },
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      title: true,
      description: true,
      sortOrder: true,
      groupId: true,
      dueAt: true,
      dueOffsetDays: true,
    },
  });

  if (sourceTasks.length === 0) {
    return { groups: sourceGroups.length, tasks: 0 };
  }

  const eventAt = options?.eventAt ?? null;

  await prisma.task.createMany({
    data: sourceTasks.map((t, index) => {
      let dueOffsetDays = t.dueOffsetDays;
      if (dueOffsetDays == null && t.dueAt && source?.eventAt) {
        dueOffsetDays = offsetFromEvent(source.eventAt, t.dueAt);
      }

      const dueAt =
        eventAt && dueOffsetDays != null
          ? dueAtFromEvent(eventAt, dueOffsetDays)
          : null;

      return {
        spaceId: targetProjectId,
        title: t.title,
        description: t.description,
        status: "todo" as const,
        sortOrder: t.sortOrder ?? index,
        createdById,
        assigneeId: null,
        groupId: t.groupId ? (groupIdMap.get(t.groupId) ?? null) : null,
        dueOffsetDays,
        dueAt,
      };
    }),
  });

  return { groups: sourceGroups.length, tasks: sourceTasks.length };
}

/** @deprecated Use copyProjectStructure */
export async function copyProjectTaskTitles(
  sourceProjectId: string,
  targetProjectId: string,
  createdById: string,
) {
  const result = await copyProjectStructure(
    sourceProjectId,
    targetProjectId,
    createdById,
  );
  return result.tasks;
}

/** Apply dueOffsetDays → dueAt for all tasks on a project after eventAt changes. */
export async function applyDueOffsetsFromEvent(
  projectId: string,
  eventAt: Date | null,
) {
  const tasks = await prisma.task.findMany({
    where: {
      spaceId: projectId,
      archivedAt: null,
      dueOffsetDays: { not: null },
      status: { not: "cancelled" },
    },
    select: { id: true, dueOffsetDays: true },
  });

  if (tasks.length === 0) return 0;

  await prisma.$transaction(
    tasks.map((t) =>
      prisma.task.update({
        where: { id: t.id },
        data: {
          dueAt:
            eventAt && t.dueOffsetDays != null
              ? dueAtFromEvent(eventAt, t.dueOffsetDays)
              : null,
        },
      }),
    ),
  );

  return tasks.length;
}
