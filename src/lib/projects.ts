import { prisma } from "@/lib/db";

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
        where: { status: { not: "cancelled" as const } },
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
    orderBy: { updatedAt: "desc" },
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
      status: { in: ["todo", "doing"] },
    },
  });
}

/** Copy non-cancelled generic task titles into a target project (fresh todos). */
export async function copyProjectTaskTitles(
  sourceProjectId: string,
  targetProjectId: string,
  createdById: string,
) {
  const sourceTasks = await prisma.task.findMany({
    where: {
      spaceId: sourceProjectId,
      status: { not: "cancelled" },
      kind: "generic",
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { title: true, description: true, sortOrder: true },
  });

  if (sourceTasks.length === 0) return 0;

  await prisma.task.createMany({
    data: sourceTasks.map((t, index) => ({
      spaceId: targetProjectId,
      title: t.title,
      description: t.description,
      kind: "generic" as const,
      status: "todo" as const,
      sortOrder: t.sortOrder ?? index,
      createdById,
      assigneeId: null,
    })),
  });

  return sourceTasks.length;
}
