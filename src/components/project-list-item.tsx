import Link from "next/link";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
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
      <Link
        href={`/projects/${project.id}`}
        className={[
          "card block px-5 py-4 transition hover:border-[var(--accent)]",
          event ? "border-l-[3px] border-l-[var(--accent)]" : "",
        ].join(" ")}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
                {project.name}
              </h2>
              <span
                className={event ? "badge badge-space-project" : "badge badge-muted"}
              >
                {event ? "Event" : "Projekt"}
              </span>
            </div>
            {event ? (
              <p className="mt-1 text-sm text-[var(--muted)]">
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
          </div>
          <div className="flex gap-2">
            <span className="badge">{openCount} offen</span>
            <span className="badge badge-muted">{project._count.tasks} total</span>
          </div>
        </div>
      </Link>
    </li>
  );
}
