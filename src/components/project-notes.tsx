"use client";

import { useState, useTransition } from "react";
import { updateProjectNotes } from "@/lib/actions";

export function ProjectNotes({
  spaceId,
  initialNotes,
  canEdit = true,
}: {
  spaceId: string;
  initialNotes: string;
  canEdit?: boolean;
}) {
  const [notes, setNotes] = useState(initialNotes);
  const [committed, setCommitted] = useState(initialNotes);
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    const fd = new FormData();
    fd.set("spaceId", spaceId);
    fd.set("notes", notes);
    startTransition(async () => {
      const result = await updateProjectNotes(fd);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setCommitted(notes);
      setSaved(true);
      setOpen(false);
    });
  }

  const preview = committed.trim();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-start gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5 text-left transition-colors hover:border-[var(--accent)]"
      >
        <span className="mt-0.5 text-[0.65rem] text-[var(--muted)]" aria-hidden>
          ▸
        </span>
        <span
          className={[
            "min-w-0 flex-1 whitespace-pre-wrap text-sm leading-snug",
            preview ? "text-[var(--fg)]" : "text-[var(--muted)]",
          ].join(" ")}
        >
          <span className="line-clamp-4">
            {preview || (canEdit ? "Notizen hinzufügen…" : "Keine Notizen")}
          </span>
        </span>
      </button>
    );
  }

  return (
    <section className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <button
          type="button"
          className="flex min-w-0 items-center gap-2 text-left"
          onClick={() => {
            if (saved) setOpen(false);
          }}
        >
          <span className="text-[0.65rem] text-[var(--muted)]" aria-hidden>
            ▼
          </span>
          <span>
            <span className="block text-sm font-semibold">Projektnotizen</span>
            <span className="block text-xs text-[var(--muted)]">
              Infos, Kontext und Hinweise für alle im Projekt.
            </span>
          </span>
        </button>
        <div className="flex shrink-0 gap-1.5">
          {canEdit && (
            <button
              type="button"
              className="btn btn-primary px-3 py-1.5 text-sm"
              disabled={pending || saved}
              onClick={save}
            >
              {pending ? "…" : "Speichern"}
            </button>
          )}
          <button
            type="button"
            className="btn btn-ghost px-3 py-1.5 text-sm"
            disabled={pending}
            onClick={() => {
              setNotes(committed);
              setSaved(true);
              setError(null);
              setOpen(false);
            }}
          >
            Schliessen
          </button>
        </div>
      </div>
      {error && (
        <p className="mb-2 text-sm text-[var(--danger)]">{error}</p>
      )}
      <textarea
        value={notes}
        onChange={(e) => {
          if (!canEdit) return;
          setNotes(e.target.value);
          setSaved(false);
        }}
        readOnly={!canEdit}
        rows={4}
        autoFocus={canEdit}
        placeholder="Ziel, Termine, Links, Absprachen…"
        className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm disabled:opacity-80"
      />
    </section>
  );
}
