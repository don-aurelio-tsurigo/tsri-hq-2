import Link from "next/link";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { CreateProjectForm } from "@/components/create-project-form";
import { ProjectActions } from "@/components/project-actions";
import { TaskList } from "@/components/task-list";
import { requireMembership } from "@/lib/session";
import {
  listArchivedProjects,
  listProjectTemplates,
  listProjects,
} from "@/lib/projects";
import { listAssignedProjectTasks } from "@/lib/tasks";
import { prisma } from "@/lib/db";

export default async function ProjectsPage() {
  const { session, membership } = await requireMembership();
  const [projects, archived, templates, myTasks] = await Promise.all([
    listProjects(membership.organizationId),
    listArchivedProjects(membership.organizationId),
    listProjectTemplates(membership.organizationId),
    listAssignedProjectTasks(membership.organizationId, session.user.id),
  ]);

  const openCounts = await Promise.all(
    projects.map(async (p) => ({
      id: p.id,
      open: await prisma.task.count({
        where: { spaceId: p.id, status: { in: ["todo", "doing"] } },
      }),
    })),
  );
  const openById = Object.fromEntries(openCounts.map((c) => [c.id, c.open]));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold tracking-wide text-[var(--accent)] uppercase">
            Tasks
          </p>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
            Projekte
          </h1>
          <p className="mt-2 text-[var(--muted)]">
            Events und Vorhaben — mit Datum, Phasen und Tasks. Vorlagen
            übernehmen Gruppen und relative Fristen.
          </p>
        </div>
        <CreateProjectForm
          templates={templates.map((t) => ({
            id: t.id,
            name: t.name,
            taskCount: t._count.tasks,
          }))}
        />
      </header>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-[var(--muted)] uppercase">
          Meine Projekt-Tasks ({myTasks.length})
        </h2>
        {myTasks.length === 0 ? (
          <div className="card px-4 py-6 text-center text-sm text-[var(--muted)]">
            Dir sind aktuell keine offenen Tasks in Projekten zugewiesen.
          </div>
        ) : (
          <div className="space-y-2">
            <TaskList
              tasks={myTasks.map((task) => ({
                id: task.id,
                title: task.title,
                description: task.description,
                status: task.status,
                dueAt: task.dueAt,
                assigneeId: task.assigneeId,
                groupId: task.groupId,
                createdAt: task.createdAt,
                space: task.space,
                assignee: task.assignee,
                createdBy: task.createdBy,
                group: task.group,
              }))}
              showSpace
              enableDrawer
              compact
            />
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-[var(--muted)] uppercase">
          Alle Projekte
        </h2>
        {projects.length === 0 ? (
          <div className="card px-5 py-12 text-center text-[var(--muted)]">
            Noch keine aktiven Projekte. Leg eines an — ggf. aus einer Vorlage.
          </div>
        ) : (
          <ul className="space-y-3">
            {projects.map((project) => (
              <li key={project.id}>
                <Link
                  href={`/projects/${project.id}`}
                  className="card block px-5 py-4 transition hover:border-[var(--accent)]"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
                        {project.name}
                      </h2>
                      {(project.eventAt || project.venue) && (
                        <p className="mt-1 text-sm text-[var(--muted)]">
                          {project.eventAt
                            ? format(project.eventAt, "d. MMM yyyy", {
                                locale: de,
                              })
                            : null}
                          {project.eventAt && project.venue ? " · " : ""}
                          {project.venue}
                        </p>
                      )}
                      {project.description && (
                        <p className="mt-1 line-clamp-2 text-sm text-[var(--muted)]">
                          {project.description}
                        </p>
                      )}
                      <p className="mt-2 text-xs text-[var(--muted)]">
                        {project.owner ? `von ${project.owner.name} · ` : ""}
                        aktualisiert{" "}
                        {format(project.updatedAt, "d. MMM yyyy", {
                          locale: de,
                        })}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <span className="badge">
                        {openById[project.id] ?? 0} offen
                      </span>
                      <span className="badge badge-muted">
                        {project._count.tasks} total
                      </span>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {templates.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-[var(--muted)] uppercase">
            Vorlagen
          </h2>
          <ul className="space-y-2">
            {templates.map((template) => (
              <li
                key={template.id}
                className="card flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <Link
                    href={`/projects/${template.id}`}
                    className="font-medium hover:underline"
                  >
                    {template.name}
                  </Link>
                  <p className="mt-0.5 text-xs text-[var(--muted)]">
                    {template._count.tasks} To-Dos · Phasen & relative Fristen ·
                    bearbeiten zum Anpassen
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="badge badge-muted">Vorlage</span>
                  <ProjectActions
                    projectId={template.id}
                    projectName={template.name}
                    isTemplate
                    archived={false}
                    canEdit
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {archived.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-[var(--muted)] uppercase">
            Archiv ({archived.length})
          </h2>
          <ul className="space-y-2">
            {archived.map((project) => (
              <li
                key={project.id}
                className="card flex flex-wrap items-center justify-between gap-3 px-4 py-3 opacity-80"
              >
                <div className="min-w-0">
                  <Link
                    href={`/projects/${project.id}`}
                    className="font-medium hover:underline"
                  >
                    {project.name}
                  </Link>
                  <p className="mt-0.5 text-xs text-[var(--muted)]">
                    archiviert{" "}
                    {project.archivedAt
                      ? format(project.archivedAt, "d. MMM yyyy", {
                          locale: de,
                        })
                      : ""}
                  </p>
                </div>
                <ProjectActions
                  projectId={project.id}
                  projectName={project.name}
                  isTemplate={false}
                  archived
                  canEdit
                />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
