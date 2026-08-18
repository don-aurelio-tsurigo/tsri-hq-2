import Link from "next/link";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { CreateProjectForm } from "@/components/create-project-form";
import { ProjectActions } from "@/components/project-actions";
import {
  parseProjectKindFilter,
  ProjectKindFilter,
} from "@/components/project-kind-filter";
import { ExpandableTaskList } from "@/components/expandable-task-list";
import { ProjectListItem } from "@/components/project-list-item";
import { requireMembership } from "@/lib/session";
import { isProjectEvent } from "@/lib/project-meta";
import {
  listArchivedProjects,
  listProjectTemplates,
  listProjects,
} from "@/lib/projects";
import { listAssignedProjectTasks } from "@/lib/tasks";
import { prisma } from "@/lib/db";

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const { kind: kindParam } = await searchParams;
  const kind = parseProjectKindFilter(kindParam);
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
        where: {
          spaceId: p.id,
          archivedAt: null,
          status: { in: ["todo", "doing"] },
        },
      }),
    })),
  );
  const openById = Object.fromEntries(openCounts.map((c) => [c.id, c.open]));

  const events = projects
    .filter((p) => isProjectEvent(p.eventAt))
    .slice()
    .sort((a, b) => {
      const da = a.eventAt ? new Date(a.eventAt).getTime() : 0;
      const db = b.eventAt ? new Date(b.eventAt).getTime() : 0;
      return da - db;
    });
  const vorhaben = projects
    .filter((p) => !isProjectEvent(p.eventAt))
    .slice()
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  const visible =
    kind === "event" ? events : kind === "vorhaben" ? vorhaben : projects;
  const sectionTitle =
    kind === "event"
      ? "Events"
      : kind === "vorhaben"
        ? "Projekte allg."
        : "Alle Projekte";
  const emptyLabel =
    kind === "event"
      ? "Keine Events. Leg eines mit Datum an."
      : kind === "vorhaben"
        ? "Keine allgemeinen Projekte. Leg eines an."
        : "Noch keine aktiven Projekte. Leg eines an — ggf. aus einer Vorlage.";

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
          <ExpandableTaskList
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
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-[var(--muted)] uppercase">
            {sectionTitle}
          </h2>
          <ProjectKindFilter
            kind={kind}
            counts={{
              all: projects.length,
              event: events.length,
              vorhaben: vorhaben.length,
            }}
          />
        </div>
        {visible.length === 0 ? (
          <div className="card px-5 py-12 text-center text-[var(--muted)]">
            {emptyLabel}
          </div>
        ) : kind === "all" ? (
          <div className="space-y-4">
            {events.length > 0 ? (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">
                  Bevorstehende Events
                </h3>
                <ul className="space-y-2">
                  {events.map((project) => (
                    <ProjectListItem
                      key={project.id}
                      project={project}
                      openCount={openById[project.id] ?? 0}
                    />
                  ))}
                </ul>
              </div>
            ) : null}
            {vorhaben.length > 0 ? (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">
                  Projekte allg.
                </h3>
                <ul className="space-y-2">
                  {vorhaben.map((project) => (
                    <ProjectListItem
                      key={project.id}
                      project={project}
                      openCount={openById[project.id] ?? 0}
                    />
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : (
          <ul className="space-y-2">
            {visible.map((project) => (
              <ProjectListItem
                key={project.id}
                project={project}
                openCount={openById[project.id] ?? 0}
              />
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
