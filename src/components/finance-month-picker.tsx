"use client";

import { MONTH_LABELS, monthKey, parseMonthKey, type MonthKey } from "@/lib/finance/shared";

/**
 * Month + year as two selects. Replaces <input type="month">, which Safari
 * and Firefox render as a plain «2026-10» text field.
 */
export function FinanceMonthPicker({
  value,
  onChange,
  idPrefix,
  label,
  compact = false,
}: {
  value: MonthKey;
  onChange: (value: MonthKey) => void;
  idPrefix?: string;
  /** Accessible name, e.g. «Monat zum Hinzufügen» */
  label: string;
  compact?: boolean;
}) {
  const [year, monthIndex] = parseMonthKey(value);
  const current = new Date().getFullYear();
  const first = Math.min(current - 3, year);
  const last = Math.max(current + 4, year);
  const years = Array.from({ length: last - first + 1 }, (_, i) => first + i);

  const cls = compact
    ? "rounded-md border-2 border-[var(--border)] bg-[var(--bg-elevated)] px-1.5 py-0.5 text-xs font-medium"
    : undefined;

  return (
    <div className="flex gap-1.5" role="group" aria-label={label}>
      <select
        id={idPrefix ? `${idPrefix}-month` : undefined}
        aria-label={`${label}: Monat`}
        value={monthIndex}
        onChange={(e) => onChange(monthKey(year, Number(e.target.value)))}
        className={cls}
      >
        {MONTH_LABELS.map((name, i) => (
          <option key={name} value={i}>
            {name}
          </option>
        ))}
      </select>
      <select
        id={idPrefix ? `${idPrefix}-year` : undefined}
        aria-label={`${label}: Jahr`}
        value={year}
        onChange={(e) => onChange(monthKey(Number(e.target.value), monthIndex))}
        className={cls}
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </div>
  );
}
