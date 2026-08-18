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

  const eventMeta = event
    ? [
        project.eventAt
          ? format(
              typeof project.eventAt === "string"
                ? parseISO(project.eventAt.slice(0, 10))
                : project.eventAt,
              "d. MMM yyyy",
              { locale: de },
            )
          : null,
        countdown,
        project.venue,
      ]
        .filter(Boolean)
        .join(" · ")
    : null;

  const updatedMeta = [
    project.owner ? `von ${project.owner.name}` : null,
    `akt. ${format(project.updatedAt, "d. MMM", { locale: de })}`,
  ]
    .filter(Boolean)
    .join(" · ");

  const metaLine = [eventMeta, updatedMeta].filter(Boolean).join(" · ");

  return (
    <li>
      <div
        className={[
          "card px-3.5 py-2.5 transition hover:border-[var(--accent)]",
          // Inset accent — keeps card width identical for events vs. general projects
          event ? "shadow-[inset_3px_0_0_0_var(--accent)]" : "",
        ].join(" ")}
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <Link
                href={`/projects/${project.id}`}
                className="min-w-0 truncate font-[family-name:var(--font-display)] text-base font-semibold leading-snug hover:underline"
              >
                {project.name}
              </Link>
              <ProjectPinButton
                projectId={project.id}
                pinned={!!project.navPinned}
              />
              <span
                className={
                  event ? "badge badge-space-project" : "badge badge-muted"
                }
              >
                {event ? "Event" : "Projekt"}
              </span>
            </div>
            <Link href={`/projects/${project.id}`} className="mt-0.5 block">
              {metaLine ? (
                <p className="truncate text-xs text-[var(--muted)]">
                  {metaLine}
                </p>
              ) : null}
              {project.description ? (
                <p className="mt-0.5 line-clamp-1 text-xs text-[var(--muted)]">
                  {project.description}
                </p>
              ) : null}
            </Link>
          </div>
          <Link
            href={`/projects/${project.id}`}
            className="flex shrink-0 gap-1.5 pt-0.5"
            tabIndex={-1}
          >
            <span className="badge">{openCount} offen</span>
            <span className="badge badge-muted">
              {project._count.tasks} total
            </span>
          </Link>
        </div>
      </div>
    </li>
  );
}
