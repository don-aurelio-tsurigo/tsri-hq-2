"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { updateProjectEventMeta } from "@/lib/actions";
import { eventCountdownLabel, toDateInputValue } from "@/lib/project-meta";

export function ProjectEventMeta({
  spaceId,
  eventAt,
  venue,
  canEdit = true,
  isTemplate = false,
}: {
  spaceId: string;
  eventAt: Date | string | null;
  venue: string | null;
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
  const countdown = eventCountdownLabel(eventAt);

  if (isTemplate) {
    return (
      <p className="text-xs text-[var(--muted)]">
        Phasen und relative Fristen (−Tage vor dem Event) werden beim Anlegen
        übernommen.
      </p>
    );
  }

  if (editing && canEdit) {
    return (
      <form
        className="flex flex-col gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2"
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
        <div className="grid gap-2 sm:grid-cols-2">
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

  if (!eventLabel && !venue) {
    if (!canEdit) return null;
    return (
      <button
        type="button"
        className="text-sm text-[var(--muted)] hover:text-[var(--accent)] hover:underline"
        onClick={() => setEditing(true)}
      >
        Event-Datum setzen
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <div className="min-w-0 text-sm">
        {eventLabel ? (
          <span className="font-semibold">
            {eventLabel}
            {countdown ? (
              <span className="font-normal text-[var(--muted)]">
                {" "}
                · {countdown}
              </span>
            ) : null}
          </span>
        ) : canEdit ? (
          <button
            type="button"
            className="text-[var(--muted)] hover:text-[var(--accent)] hover:underline"
            onClick={() => setEditing(true)}
          >
            Event-Datum setzen
          </button>
        ) : null}
        {venue ? (
          <span className="text-[var(--muted)]">
            {eventLabel ? " · " : ""}
            {venue}
          </span>
        ) : null}
      </div>
      {canEdit && (
        <button
          type="button"
          className="shrink-0 text-xs font-medium text-[var(--muted)] hover:text-[var(--fg)]"
          onClick={() => setEditing(true)}
        >
          Bearbeiten
        </button>
      )}
    </div>
  );
}
