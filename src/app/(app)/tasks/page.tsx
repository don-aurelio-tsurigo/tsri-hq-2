import { GroupedTasksBoard } from "@/components/personal-tasks";
import { prisma } from "@/lib/db";
import { requireMembership } from "@/lib/session";
import { ensurePersonalSpace, getPersonalSpace } from "@/lib/spaces";
import { listSpaceTasks, listTaskGroups } from "@/lib/tasks";

export default async function PersonalTasksPage() {
  const { session, membership } = await requireMembership();

  let personal = await getPersonalSpace(
    membership.organizationId,
    session.user.id,
  );
  if (!personal) {
    personal = await ensurePersonalSpace(
      membership.organizationId,
      session.user.id,
      session.user.name,
    );
  }

  const [tasks, groups, members] = await Promise.all([
    listSpaceTasks(personal.id),
    listTaskGroups(personal.id),
    prisma.membership.findMany({
      where: { organizationId: membership.organizationId },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { user: { name: "asc" } },
    }),
  ]);

  return (
    <GroupedTasksBoard
      spaceId={personal.id}
      eyebrow="Tasks"
      title="Persönliche Tasks"
      members={members.map((m) => m.user)}
      groups={groups.map((g) => ({ id: g.id, name: g.name }))}
      tasks={tasks.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        status: t.status,
        dueAt: t.dueAt,
        kind: t.kind,
        stage: t.stage,
        assigneeId: t.assigneeId,
        groupId: t.groupId,
        createdAt: t.createdAt,
        assignee: t.assignee,
        createdBy: t.createdBy,
        group: t.group,
      }))}
    />
  );
}
