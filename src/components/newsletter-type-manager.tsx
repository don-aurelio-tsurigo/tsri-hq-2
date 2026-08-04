"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createNewsletterType,
  updateNewsletterType,
} from "@/lib/actions";
import {
  DEFAULT_WEEKDAYS_BY_FREQUENCY,
  formatWeekdays,
  NEWSLETTER_FREQUENCY_LABELS,
  WEEKDAY_LABELS,
  WEEKDAYS,
  type NewsletterFrequencyValue,
  type Weekday,
} from "@/lib/newsletter-constants";

export type NewsletterTypeRow = {
  id: string;
  name: string;
  frequency: NewsletterFrequencyValue;
  weekdays: number[];
};

export function NewsletterTypeManager({
  types,
}: {
  types: NewsletterTypeRow[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [frequency, setFrequency] =
    useState<NewsletterFrequencyValue>("weekly");
  const [weekdays, setWeekdays] = useState<Weekday[]>(
    DEFAULT_WEEKDAYS_BY_FREQUENCY.weekly,
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [editId, setEditId] = useState<string | null>(null);

  function toggleDay(day: Weekday) {
    setWeekdays((prev) =>
      prev.includes(day)
        ? prev.filter((d) => d !== day)
        : [...prev, day].sort((a, b) => a - b),
    );
  }

  function startEdit(type: NewsletterTypeRow) {
    setEditId(type.id);
    setName(type.name);
    setFrequency(type.frequency);
    setWeekdays(
      type.weekdays.filter((d): d is Weekday =>
        (WEEKDAYS as readonly number[]).includes(d),
      ),
    );
    setError(null);
  }

  function resetForm() {
    setEditId(null);
    setName("");
    setFrequency("weekly");
    setWeekdays(DEFAULT_WEEKDAYS_BY_FREQUENCY.weekly);
    setError(null);
  }

  function saveType() {
    setError(null);
    const fd = new FormData();
    if (editId) fd.set("id", editId);
    fd.set("name", name);
    fd.set("frequency", frequency);
    for (const d of weekdays) fd.append("weekdays", String(d));
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

  return (
    <section className="card space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
          Newsletter-Typen
        </h2>
        <p className="text-sm text-[var(--muted)]">
          Rhythmus = Erscheinungstage im Kalender
        </p>
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
                {NEWSLETTER_FREQUENCY_LABELS[t.frequency]} ·{" "}
                {formatWeekdays(t.weekdays)}
              </p>
            </div>
            <button
              type="button"
              className="btn btn-secondary text-xs"
              onClick={() => startEdit(t)}
            >
              Bearbeiten
            </button>
          </li>
        ))}
        {types.length === 0 && (
          <li className="px-3 py-4 text-sm text-[var(--muted)]">
            Noch kein Typ — lege unten einen an.
          </li>
        )}
      </ul>

      <div className="space-y-3 rounded-xl border border-dashed border-[var(--border)] p-3">
        <p className="text-sm font-semibold">
          {editId ? "Typ bearbeiten" : "Neuer Typ"}
        </p>
        <label className="field text-xs font-semibold text-[var(--muted)]">
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="z.B. Züri Briefing"
          />
        </label>
        <label className="field text-xs font-semibold text-[var(--muted)]">
          Frequenz
          <select
            value={frequency}
            onChange={(e) => {
              const f = e.target.value as NewsletterFrequencyValue;
              setFrequency(f);
              setWeekdays(DEFAULT_WEEKDAYS_BY_FREQUENCY[f]);
            }}
          >
            {(
              Object.keys(
                NEWSLETTER_FREQUENCY_LABELS,
              ) as NewsletterFrequencyValue[]
            ).map((key) => (
              <option key={key} value={key}>
                {NEWSLETTER_FREQUENCY_LABELS[key]}
              </option>
            ))}
          </select>
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
        {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            className="btn btn-primary text-sm"
            disabled={pending || !name.trim() || weekdays.length === 0}
            onClick={saveType}
          >
            {pending ? "…" : editId ? "Speichern" : "Anlegen"}
          </button>
          {editId && (
            <button
              type="button"
              className="btn btn-secondary text-sm"
              onClick={resetForm}
            >
              Abbrechen
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
