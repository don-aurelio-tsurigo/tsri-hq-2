"use client";

import { useState, useTransition } from "react";
import { createProject } from "@/lib/actions";

type TemplateOption = { id: string; name: string; taskCount: number };

export function CreateProjectForm({
  templates = [],
}: {
  templates?: TemplateOption[];
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [hasTemplate, setHasTemplate] = useState(false);

  if (!open) {
    return (
      <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
        Neues Projekt
      </button>
    );
  }

  return (
    <form
      className="card flex flex-col gap-3 p-4"
      action={(fd) => {
        setError(null);
        startTransition(async () => {
          const result = await createProject(fd);
          if (result?.error) {
            setError(result.error);
          }
        });
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
          Neues Projekt
        </h2>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => setOpen(false)}
        >
          Abbrechen
        </button>
      </div>
      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      )}
      <div className="field">
        <label htmlFor="project-name">Name</label>
        <input
          id="project-name"
          name="name"
          required
          minLength={2}
          placeholder="z.B. Adventskalender 2026"
        />
      </div>
      <div className="field">
        <label htmlFor="project-desc">Beschreibung</label>
        <textarea
          id="project-desc"
          name="description"
          rows={3}
          placeholder="Kurz: Ziel, Kontext…"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="field">
          <label htmlFor="project-event">Event-Datum</label>
          <input id="project-event" name="eventAt" type="date" />
        </div>
        <div className="field">
          <label htmlFor="project-venue">Ort</label>
          <input
            id="project-venue"
            name="venue"
            placeholder="optional"
          />
        </div>
      </div>
      {templates.length > 0 && (
        <div className="field">
          <label htmlFor="project-template">Aus Vorlage (optional)</label>
          <select
            id="project-template"
            name="templateId"
            defaultValue=""
            onChange={(e) => setHasTemplate(e.target.value.length > 0)}
          >
            <option value="">— leeres Projekt —</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.taskCount} To-Dos)
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Übernimmt Phasen und Tasks
            {hasTemplate
              ? "; mit Event-Datum werden relative Fristen gesetzt."
              : "."}
          </p>
        </div>
      )}
      <button type="submit" className="btn btn-primary self-start" disabled={pending}>
        {pending ? "…" : "Projekt anlegen"}
      </button>
    </form>
  );
}
