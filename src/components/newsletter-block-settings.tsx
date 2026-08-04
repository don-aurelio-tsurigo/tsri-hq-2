"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createNewsletterBlockedRange,
  deleteNewsletterBlockedRange,
  updateNewsletterHideHolidays,
} from "@/lib/actions";

export type BlockedRangeRow = {
  id: string;
  startKey: string;
  endKey: string;
  label: string | null;
};

function formatRangeLabel(startKey: string, endKey: string) {
  const fmt = (key: string) => {
    const [y, m, d] = key.split("-");
    return `${Number(d)}.${Number(m)}.${y}`;
  };
  if (startKey === endKey) return fmt(startKey);
  return `${fmt(startKey)} – ${fmt(endKey)}`;
}

export function NewsletterBlockSettings({
  hidePublicHolidays,
  blockedRanges,
}: {
  hidePublicHolidays: boolean;
  blockedRanges: BlockedRangeRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  function toggleHolidays(next: boolean) {
    setError(null);
    const fd = new FormData();
    fd.set("hidePublicHolidays", next ? "true" : "false");
    startTransition(async () => {
      await updateNewsletterHideHolidays(fd);
      router.refresh();
    });
  }

  function addRange() {
    setError(null);
    const fd = new FormData();
    fd.set("startDate", startDate);
    fd.set("endDate", endDate || startDate);
    fd.set("label", label);
    startTransition(async () => {
      const result = await createNewsletterBlockedRange(fd);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setLabel("");
      setStartDate("");
      setEndDate("");
      router.refresh();
    });
  }

  function removeRange(id: string) {
    setError(null);
    const fd = new FormData();
    fd.set("id", id);
    startTransition(async () => {
      const result = await deleteNewsletterBlockedRange(fd);
      if (result?.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="card space-y-5 p-4">
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
          Feiertage & Sommerpausen
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Geblockte Tage erscheinen nicht im Newsletter-Kalender.
        </p>
      </div>

      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--border)] px-3 py-3">
        <input
          type="checkbox"
          className="mt-1"
          checked={hidePublicHolidays}
          disabled={pending}
          onChange={(e) => toggleHolidays(e.target.checked)}
        />
        <span>
          <span className="font-semibold">Feiertage ausblenden</span>
          <span className="mt-0.5 block text-sm text-[var(--muted)]">
            Keine Slots an öffentlichen Feiertagen (ZH/CH)
          </span>
        </span>
      </label>

      <div className="space-y-3">
        <p className="text-sm font-semibold">Geblockte Zeiträume</p>
        <ul className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)]">
          {blockedRanges.map((range) => (
            <li
              key={range.id}
              className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
            >
              <div>
                <p className="font-semibold">
                  {range.label?.trim() || "Sommerpause / Block"}
                </p>
                <p className="text-sm text-[var(--muted)]">
                  {formatRangeLabel(range.startKey, range.endKey)}
                </p>
              </div>
              <button
                type="button"
                className="btn btn-secondary text-xs"
                disabled={pending}
                onClick={() => removeRange(range.id)}
              >
                Entfernen
              </button>
            </li>
          ))}
          {blockedRanges.length === 0 && (
            <li className="px-3 py-4 text-sm text-[var(--muted)]">
              Noch keine Sommerpause oder andere Pause hinterlegt.
            </li>
          )}
        </ul>

        <div className="space-y-3 rounded-xl border border-dashed border-[var(--border)] p-3">
          <p className="text-sm font-semibold">Zeitraum hinzufügen</p>
          <label className="field text-xs font-semibold text-[var(--muted)]">
            Bezeichnung (optional)
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="z.B. Sommerpause 2026"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="field text-xs font-semibold text-[var(--muted)]">
              Von
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  if (!endDate) setEndDate(e.target.value);
                }}
              />
            </label>
            <label className="field text-xs font-semibold text-[var(--muted)]">
              Bis
              <input
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </label>
          </div>
          <button
            type="button"
            className="btn btn-primary text-sm"
            disabled={pending || !startDate}
            onClick={addRange}
          >
            {pending ? "…" : "Blockieren"}
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
    </section>
  );
}
