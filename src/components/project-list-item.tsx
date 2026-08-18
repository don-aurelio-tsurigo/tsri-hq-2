import Link from "next/link";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { ProjectPinButton } from "@/components/project-pin-button";
import {
  eventCountdownLabel,
  isProjectEvent,
} from "@/lib/project-meta";

export type ProjectListItemData = {
  id: string;
  name: string;
  description: string | null;
  eventAt: Date | string | null;
  venue: string | null;
  updatedAt: Date;
  navPinned?: boolean;
  owner: { name: string } | null;
  _count: { tasks: number };
};

export function ProjectListItem({
  project,
  openCount,
}: {
  project: ProjectListItemData;
  openCount: number;
}) {
  const event = isProjectEvent(project.eventAt);
  const countdown = eventCountdownLabel(project.eventAt);

  return (
    <li>
      <div
        className={[
          "card px-5 py-4 transition hover:border-[var(--accent)]",
          // Inset accent — keeps card width identical for events vs. general projects
          event ? "shadow-[inset_3px_0_0_0_var(--accent)]" : "",
        ].join(" ")}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/projects/${project.id}`}
                className="font-[family-name:var(--font-display)] text-lg font-semibold hover:underline"
              >
                {project.name}
              </Link>
              <ProjectPinButton
                projectId={project.id}
                pinned={!!project.navPinned}
              />
              <span
                className={event ? "badge badge-space-project" : "badge badge-muted"}
              >
                {event ? "Event" : "Projekt"}
              </span>
            </div>
            <Link href={`/projects/${project.id}`} className="mt-1 block">
              {event ? (
                <p className="text-sm text-[var(--muted)]">
                  {project.eventAt
                    ? format(
                        typeof project.eventAt === "string"
                          ? parseISO(project.eventAt.slice(0, 10))
                          : project.eventAt,
                        "d. MMM yyyy",
                        { locale: de },
                      )
                    : null}
                  {countdown ? ` · ${countdown}` : ""}
                  {project.venue ? ` · ${project.venue}` : ""}
                </p>
              ) : null}
              {project.description ? (
                <p className="mt-1 line-clamp-2 text-sm text-[var(--muted)]">
                  {project.description}
                </p>
              ) : null}
              <p className="mt-2 text-xs text-[var(--muted)]">
                {project.owner ? `von ${project.owner.name} · ` : ""}
                aktualisiert{" "}
                {format(project.updatedAt, "d. MMM yyyy", { locale: de })}
              </p>
            </Link>
          </div>
          <Link
            href={`/projects/${project.id}`}
            className="flex gap-2"
            tabIndex={-1}
          >
            <span className="badge">{openCount} offen</span>
            <span className="badge badge-muted">{project._count.tasks} total</span>
          </Link>
        </div>
      </div>
    </li>
  );
}
