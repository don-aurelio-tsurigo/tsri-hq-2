"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { differenceInCalendarDays, format, parseISO, startOfDay } from "date-fns";
import { de } from "date-fns/locale";
import { updateProjectEventMeta } from "@/lib/actions";
import {
  PROJECT_STATUSES,
  PROJECT_STATUS_LABELS,
  toDateInputValue,
  type PhaseProgress,
} from "@/lib/project-meta";
import type { ProjectStatus } from "@/generated/prisma/client";

function countdownLabel(eventAt: Date | string | null) {
  if (!eventAt) return null;
  const event =
    typeof eventAt === "string"
      ? startOfDay(parseISO(eventAt.slice(0, 10)))
      : startOfDay(eventAt);
  const today = startOfDay(new Date());
  const days = differenceInCalendarDays(event, today);
  if (days === 0) return "Heute";
  if (days === 1) return "Morgen";
  if (days === -1) return "Gestern";
  if (days > 1) return `in ${days} Tagen`;
  return `vor ${Math.abs(days)} Tagen`;
}

export function ProjectEventMeta({
  spaceId,
  eventAt,
  venue,
  projectStatus,
  phases,
  canEdit = true,
  isTemplate = false,
}: {
  spaceId: string;
  eventAt: Date | string | null;
  venue: string | null;
  projectStatus: ProjectStatus | null;
  phases: PhaseProgress[];
  canEdit?: boolean;
  isTemplate?: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const eventLabel = eventAt
    ? format(
        typeof eventAt === "string" ? parseISO(eventAt.slice(0, 10)) : eventAt,
        "d. MMMM yyyy",
        { locale: de },
      )
    : null;
  const countdown = countdownLabel(eventAt);

  if (isTemplate) {
    return (
      <section className="rounded-[var(--radius)] border border-dashed border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 text-sm text-[var(--muted)]">
        <p className="font-medium text-[var(--fg)]">Event-Vorlage</p>
        <p className="mt-1">
          Phasen und relative Fristen (−Tage vor dem Event) werden beim Anlegen
          eines Projekts übernommen. Setze am neuen Projekt das Event-Datum.
        </p>
        {phases.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2">
            {phases.map((p) => (
              <li key={p.groupId ?? "__none"} className="badge badge-muted">
                {p.name} · {p.total} Tasks
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  if (editing && canEdit) {
    return (
      <form
        className="card flex flex-col gap-3 p-4"
        action={(fd) => {
          setError(null);
          startTransition(async () => {
            const result = await updateProjectEventMeta(fd);
            if (result?.error) {
              setError(result.error);
              return;
            }
            setEditing(false);
            router.refresh();
          });
        }}
      >
        <input type="hidden" name="spaceId" value={spaceId} />
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">Event-Details</h2>
          <button
            type="button"
            className="btn btn-ghost px-2 py-1 text-sm"
            onClick={() => setEditing(false)}
            disabled={pending}
          >
            Abbrechen
          </button>
        </div>
        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-[var(--danger)]">
            {error}
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="field">
            <label htmlFor="event-at">Event-Datum</label>
            <input
              id="event-at"
              name="eventAt"
              type="date"
              defaultValue={toDateInputValue(eventAt)}
              disabled={pending}
            />
          </div>
          <div className="field">
            <label htmlFor="event-venue">Ort</label>
            <input
              id="event-venue"
              name="venue"
              defaultValue={venue ?? ""}
              placeholder="z.B. Moods"
              disabled={pending}
            />
          </div>
          <div className="field">
            <label htmlFor="event-status">Status</label>
            <select
              id="event-status"
              name="projectStatus"
              defaultValue={projectStatus ?? "idea"}
              disabled={pending}
            >
              {PROJECT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {PROJECT_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="text-xs text-[var(--muted)]">
          Ändern des Event-Datums aktualisiert alle Tasks mit relativem Offset.
        </p>
        <button type="submit" className="btn btn-primary self-start" disabled={pending}>
          {pending ? "…" : "Speichern"}
        </button>
      </form>
    );
  }

  return (
    <section className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            {projectStatus && (
              <span className="badge">{PROJECT_STATUS_LABELS[projectStatus]}</span>
            )}
            {eventLabel ? (
              <p className="text-sm font-semibold">
                {eventLabel}
                {countdown ? (
                  <span className="font-normal text-[var(--muted)]">
                    {" "}
                    · {countdown}
                  </span>
                ) : null}
              </p>
            ) : (
              <p className="text-sm text-[var(--muted)]">Kein Event-Datum gesetzt</p>
            )}
          </div>
          {venue && (
            <p className="text-sm text-[var(--muted)]">{venue}</p>
          )}
        </div>
        {canEdit && (
          <button
            type="button"
            className="btn btn-ghost px-2 py-1 text-sm"
            onClick={() => setEditing(true)}
          >
            Bearbeiten
          </button>
        )}
      </div>

      {phases.length > 0 && (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {phases.map((p) => {
            const pct = p.total === 0 ? 0 : Math.round((p.done / p.total) * 100);
            return (
              <li key={p.groupId ?? "__none"} className="min-w-0">
                <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                  <span className="truncate font-medium">{p.name}</span>
                  <span className="shrink-0 text-[var(--muted)]">
                    {p.done}/{p.total}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-[var(--border)]">
                  <div
                    className="h-full rounded-full bg-[var(--accent)]"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
