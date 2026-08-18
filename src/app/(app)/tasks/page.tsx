import { GroupedTasksBoard } from "@/components/personal-tasks";
import { prisma } from "@/lib/db";
import { requireMembership } from "@/lib/session";
import { ensurePersonalSpace } from "@/lib/spaces";
import {
  listAssignedProjectTasks,
  listNavTaskPins,
  listSpaceTasks,
  listTaskGroups,
} from "@/lib/tasks";

function toTaskRow(
  t: {
    id: string;
    title: string;
    description: string | null;
    status: "todo" | "doing" | "done" | "cancelled";
    dueAt: Date | null;
    assigneeId: string | null;
    groupId: string | null;
    createdAt: Date;
    assignee: { id: string; name: string } | null;
    createdBy: { id: string; name: string } | null;
    group: { id: string; name: string } | null;
    space?: { id: string; name: string; type: string } | null;
  },
  fallbackSpace?: { id: string; name: string; type: string },
) {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    status: t.status,
    dueAt: t.dueAt,
    assigneeId: t.assigneeId,
    groupId: t.groupId,
    createdAt: t.createdAt,
    assignee: t.assignee,
    createdBy: t.createdBy,
    group: t.group,
    space: t.space ?? fallbackSpace,
  };
}

export default async function PersonalTasksPage({
  searchParams,
}: {
  searchParams: Promise<{ list?: string; project?: string }>;
}) {
  const { session, membership } = await requireMembership();
  const { list: listParam, project: projectParam } = await searchParams;

  const personal = await ensurePersonalSpace(
    membership.organizationId,
    session.user.id,
    session.user.firstName?.trim() || session.user.name,
  );

  const personalSpace = {
    id: personal.id,
    name: personal.name,
    type: personal.type,
  };

  const [personalTasks, assignedProjectTasks, members, groups, navPins] =
    await Promise.all([
      listSpaceTasks(personal.id),
      listAssignedProjectTasks(membership.organizationId, session.user.id),
      prisma.membership.findMany({
        where: {
          organizationId: membership.organizationId,
          archivedAt: null,
        },
        include: { user: { select: { id: true, name: true } } },
        orderBy: { user: { name: "asc" } },
      }),
      listTaskGroups(personal.id),
      listNavTaskPins(session.user.id, membership.organizationId),
    ]);

  const byId = new Map<string, ReturnType<typeof toTaskRow>>();
  for (const t of personalTasks) {
    byId.set(t.id, toTaskRow(t, personalSpace));
  }
  for (const t of assignedProjectTasks) {
    if (!byId.has(t.id)) {
      byId.set(t.id, toTaskRow(t));
    }
  }

  const tasks = [...byId.values()].sort((a, b) => {
    const aDue = a.dueAt ? new Date(a.dueAt).getTime() : Number.POSITIVE_INFINITY;
    const bDue = b.dueAt ? new Date(b.dueAt).getTime() : Number.POSITIVE_INFINITY;
    if (aDue !== bDue) return aDue - bDue;
    return (
      new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime()
    );
  });

  const pinnedListIds = new Set(
    navPins.filter((p) => p.kind === "list").map((p) => p.id),
  );
  const pinnedProjectIds = navPins
    .filter((p) => p.kind === "project")
    .map((p) => p.id);
  const focusListId =
    listParam && groups.some((g) => g.id === listParam) ? listParam : null;
  const focusProjectId = projectParam || null;
  const initialMode = focusProjectId
    ? "project"
    : "list";

  return (
    <GroupedTasksBoard
      spaceId={personal.id}
      variant="inbox"
      eyebrow="Tasks"
      title="Meine Tasks"
      currentUserId={session.user.id}
      members={members.map((m) => m.user)}
      groups={groups.map((g) => ({
        id: g.id,
        name: g.name,
        pinned: pinnedListIds.has(g.id),
      }))}
      tasks={tasks}
      pinnedProjectIds={pinnedProjectIds}
      initialMode={initialMode}
      focusListId={focusListId}
      focusProjectId={focusProjectId}
    />
  );
}
