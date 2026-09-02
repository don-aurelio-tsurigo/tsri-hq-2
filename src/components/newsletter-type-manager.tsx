"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createNewsletterType,
  deleteNewsletterType,
  updateNewsletterType,
} from "@/lib/actions";
import {
  formatWeekdays,
  WEEKDAY_LABELS,
  WEEKDAYS,
  type Weekday,
} from "@/lib/newsletter-constants";

export type NewsletterTypeRow = {
  id: string;
  name: string;
  weekdays: number[];
  requiresWordle: boolean;
};

const DEFAULT_WEEKDAYS: Weekday[] = [2];

export function NewsletterTypeManager({
  types,
  managedTypeNames = [],
}: {
  types: NewsletterTypeRow[];
  managedTypeNames?: string[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [weekdays, setWeekdays] = useState<Weekday[]>(DEFAULT_WEEKDAYS);
  const [requiresWordle, setRequiresWordle] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [editId, setEditId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  function toggleDay(day: Weekday) {
    setWeekdays((prev) =>
      prev.includes(day)
        ? prev.filter((d) => d !== day)
        : [...prev, day].sort((a, b) => a - b),
    );
  }

  function startEdit(type: NewsletterTypeRow) {
    setEditId(type.id);
    setFormOpen(true);
    setName(type.name);
    setWeekdays(
      type.weekdays.filter((d): d is Weekday =>
        (WEEKDAYS as readonly number[]).includes(d),
      ),
    );
    setRequiresWordle(type.requiresWordle);
    setError(null);
  }

  function resetForm() {
    setEditId(null);
    setFormOpen(false);
    setName("");
    setWeekdays(DEFAULT_WEEKDAYS);
    setRequiresWordle(false);
    setError(null);
  }

  function saveType() {
    setError(null);
    const fd = new FormData();
    if (editId) fd.set("id", editId);
    fd.set("name", name);
    for (const d of weekdays) fd.append("weekdays", String(d));
    if (requiresWordle) fd.set("requiresWordle", "true");
    startTransition(async () => {
      const result = editId
        ? await updateNewsletterType(fd)
        : await createNewsletterType(fd);
      if (result?.error) {
        setError(result.error);
        return;
      }
      resetForm();
      router.refresh();
    });
  }

  function removeType(type: NewsletterTypeRow) {
    const isManaged = managedTypeNames.includes(type.name);
    if (
      !confirm(
        isManaged
          ? `«${type.name}» aus dem Newsletter-Kalender entfernen?\nDer Typ bleibt im Schichtplan verfügbar; bestehende Ausgaben bleiben erhalten.`
          : `«${type.name}» wirklich löschen?\nDer Typ verschwindet aus der Planung; bestehende Ausgaben bleiben erhalten.`,
      )
    ) {
      return;
    }
    setError(null);
    const fd = new FormData();
    fd.set("id", type.id);
    startTransition(async () => {
      const result = await deleteNewsletterType(fd);
      if (result?.error) {
        setError(result.error);
        return;
      }
      if (editId === type.id) resetForm();
      router.refresh();
    });
  }

  return (
    <section className="card space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
            Newsletter-Typen
          </h2>
          <p className="text-sm text-[var(--muted)]">
            Erscheinungstage im Kalender
          </p>
        </div>
        {!formOpen && (
          <button
            type="button"
            className="btn btn-primary text-sm"
            onClick={() => {
              resetForm();
              setFormOpen(true);
            }}
          >
            Neuer Typ
          </button>
        )}
      </div>
      <ul className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)]">
        {types.map((t) => (
          <li
            key={t.id}
            className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
          >
            <div>
              <p className="font-semibold">{t.name}</p>
              <p className="text-sm text-[var(--muted)]">
                {formatWeekdays(t.weekdays)}
                {t.requiresWordle ? " · Wordle aktiv" : ""}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                className="btn btn-ghost px-2 py-1 text-xs"
                disabled={pending}
                onClick={() => startEdit(t)}
              >
                Bearbeiten
              </button>
              <button
                type="button"
                className="btn btn-danger px-2 py-1 text-xs"
                disabled={pending}
                onClick={() => removeType(t)}
              >
                Löschen
              </button>
            </div>
          </li>
        ))}
        {types.length === 0 && (
          <li className="px-3 py-4 text-sm text-[var(--muted)]">
            Noch kein Typ.
          </li>
        )}
      </ul>

      {formOpen && (
      <div className="space-y-3 rounded-xl border border-dashed border-[var(--border)] p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">
            {editId ? "Typ bearbeiten" : "Neuer Typ"}
          </p>
          <button
            type="button"
            className="btn btn-ghost px-3 py-1.5 text-sm"
            onClick={resetForm}
          >
            Abbrechen
          </button>
        </div>
        <label className="field text-xs font-semibold text-[var(--muted)]">
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="z.B. Züri Briefing"
          />
        </label>
        <div>
          <p className="mb-1 text-xs font-semibold text-[var(--muted)]">
            Erscheinungstage
          </p>
          <div className="flex flex-wrap gap-1">
            {WEEKDAYS.map((day) => (
              <button
                key={day}
                type="button"
                className={[
                  "rounded-lg px-2 py-1 text-xs font-bold",
                  weekdays.includes(day)
                    ? "bg-[var(--highlight)] text-[#0a0a0a]"
                    : "bg-black/5 text-[var(--muted)]",
                ].join(" ")}
                onClick={() => toggleDay(day)}
              >
                {WEEKDAY_LABELS[day]}
              </button>
            ))}
          </div>
        </div>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--border)] px-3 py-2.5">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={requiresWordle}
            onChange={(e) => setRequiresWordle(e.target.checked)}
          />
          <span>
            <span className="text-sm font-semibold">Wordle verlangen</span>
            <span className="mt-0.5 block text-xs text-[var(--muted)]">
              Zeigt das Wordle-Feld in der Planung; die Card wird erst
              «vollständig», wenn Autor, Link und Wordle gesetzt sind
            </span>
          </span>
        </label>
        {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
        <button
          type="button"
          className="btn btn-primary text-sm"
          disabled={pending || !name.trim() || weekdays.length === 0}
          onClick={saveType}
        >
          {pending ? "…" : editId ? "Speichern" : "Anlegen"}
        </button>
      </div>
      )}
    </section>
  );
}
