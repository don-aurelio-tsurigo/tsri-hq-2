import Link from "next/link";
import { notFound } from "next/navigation";
import { GroupedTasksBoard } from "@/components/personal-tasks";
import { ProjectActions } from "@/components/project-actions";
import { ProjectEventMeta } from "@/components/project-event-meta";
import { canEditSpace, canViewSpace } from "@/lib/permissions";
import {
  getProject,
  getProjectPhaseProgress,
} from "@/lib/projects";
import { requireMembership } from "@/lib/session";
import { listSpaceTasks, listTaskGroups } from "@/lib/tasks";
import { prisma } from "@/lib/db";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const { session, membership } = await requireMembership();

  const project = await getProject(membership.organizationId, projectId);
  if (!project || !canViewSpace(session.user, project, membership)) {
    notFound();
  }

  const [tasks, groups, members, phases] = await Promise.all([
    listSpaceTasks(project.id),
    listTaskGroups(project.id),
    prisma.membership.findMany({
      where: {
        organizationId: membership.organizationId,
        archivedAt: null,
      },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { createdAt: "asc" },
    }),
    getProjectPhaseProgress(project.id),
  ]);

  const canEdit = canEditSpace(session.user, project, membership);
  const archived = !!project.archivedAt;

  return (
    <GroupedTasksBoard
      spaceId={project.id}
      eyebrow={
        project.isTemplate
          ? "Vorlage"
          : archived
            ? "Archiviertes Projekt"
            : "Projekt"
      }
      title={project.name}
      description={project.description}
      projectNotes={!project.isTemplate}
      canEdit={canEdit}
      isTemplate={project.isTemplate}
      members={members.map((m) => m.user)}
      groups={groups.map((g) => ({ id: g.id, name: g.name }))}
      headerExtra={
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link
              href="/projects"
              className="text-sm font-medium text-[var(--accent)] hover:underline"
            >
              ← Projekte
            </Link>
            <ProjectActions
              projectId={project.id}
              projectName={project.name}
              isTemplate={project.isTemplate}
              archived={archived}
              canEdit={canEdit}
            />
          </div>
          <ProjectEventMeta
            spaceId={project.id}
            eventAt={project.eventAt}
            venue={project.venue}
            phases={phases}
            canEdit={canEdit && !archived}
            isTemplate={project.isTemplate}
          />
        </div>
      }
      tasks={tasks.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        status: t.status,
        dueAt: t.dueAt,
        dueOffsetDays: t.dueOffsetDays,
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
