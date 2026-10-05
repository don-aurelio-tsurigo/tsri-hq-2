"use client";

import { useState } from "react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { Repeat } from "lucide-react";
import {
  RECURRENCE_PRESETS,
  nextDueAt,
  parseRecurrence,
  recurrenceLabel,
  recurrencePresetKey,
  type Recurrence,
} from "@/lib/recurrence";

/**
 * Fälligkeitsdatum + Wiederholung fürs Task-Formular.
 * Schreibt `dueAt` und `recurrence` (JSON, "" = keine) als Formularfelder.
 */
export function DueAndRecurrenceFields({
  id,
  defaultDueAt,
  defaultRecurrence,
  disabled,
}: {
  id: string;
  /** yyyy-MM-dd oder "" */
  defaultDueAt: string;
  defaultRecurrence?: unknown;
  disabled?: boolean;
}) {
  const [dueAt, setDueAt] = useState(defaultDueAt);
  const [rule, setRule] = useState<Recurrence | null>(() =>
    parseRecurrence(defaultRecurrence),
  );
  const presetKey = recurrencePresetKey(rule);

  function onPresetChange(key: string) {
    if (!key) return setRule(null);
    const preset = RECURRENCE_PRESETS.find((p) => p.key === key);
    if (!preset) return;
    setRule({ ...preset.rule, anchor: rule?.anchor ?? "due" });
  }

  const preview = rule
    ? nextDueAt(rule, dueAt ? new Date(`${dueAt}T00:00:00.000Z`) : null)
    : null;

  return (
    <>
      <div className="field">
        <label htmlFor={`task-due-${id}`}>Fällig am</label>
        <input
          id={`task-due-${id}`}
          type="date"
          name="dueAt"
          value={dueAt}
          onChange={(e) => setDueAt(e.target.value)}
          disabled={disabled}
        />
      </div>

      <div className="field">
        <label htmlFor={`task-recurrence-${id}`}>Wiederholen</label>
        <select
          id={`task-recurrence-${id}`}
          value={presetKey}
          onChange={(e) => onPresetChange(e.target.value)}
          disabled={disabled}
        >
          <option value="">Nie</option>
          {RECURRENCE_PRESETS.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
          {presetKey === "custom" && rule && (
            <option value="custom" disabled>
              {recurrenceLabel({ ...rule, anchor: "due" })}
            </option>
          )}
        </select>
        <input
          type="hidden"
          name="recurrence"
          value={rule ? JSON.stringify(rule) : ""}
        />
        {preview && (
          <p className="inline-flex items-center gap-1 text-xs text-[var(--muted)]">
            <Repeat className="size-3" strokeWidth={1.75} />
            Nächster Termin nach Erledigung
            {rule?.anchor === "done" ? " (ab heute)" : ""}:{" "}
            {format(preview, "EEE, d. MMM", { locale: de })}
          </p>
        )}
      </div>

      {rule && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 rounded border-[var(--border)] accent-[var(--accent)]"
            checked={rule.anchor === "done"}
            disabled={disabled}
            onChange={(e) =>
              setRule({ ...rule, anchor: e.target.checked ? "done" : "due" })
            }
          />
          Ab Erledigt-Datum rechnen
        </label>
      )}
    </>
  );
}
