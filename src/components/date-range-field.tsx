"use client";

import { useEffect, useId, useMemo, useRef, useState, type MouseEvent } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isAfter,
  isBefore,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { de } from "date-fns/locale";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";

type Props = {
  id?: string;
  label: string;
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  className?: string;
};

function toKey(d: Date) {
  return format(d, "yyyy-MM-dd");
}

function formatDisplay(from: string, to: string) {
  const opts = { locale: de };
  if (from && to) {
    const a = format(parseISO(from), "dd.MM.yyyy", opts);
    const b = format(parseISO(to), "dd.MM.yyyy", opts);
    return from === to ? a : `${a} – ${b}`;
  }
  if (from) return `${format(parseISO(from), "dd.MM.yyyy", opts)} – …`;
  if (to) return `… – ${format(parseISO(to), "dd.MM.yyyy", opts)}`;
  return "";
}

export function DateRangeField({
  id,
  label,
  from,
  to,
  onChange,
  className,
}: Props) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() =>
    from ? parseISO(from) : to ? parseISO(to) : new Date(),
  );
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);

  useEffect(() => {
    if (!open) return;
    setDraftFrom(from);
    setDraftTo(to);
    setMonth(from ? parseISO(from) : to ? parseISO(to) : new Date());
  }, [open, from, to]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [month]);

  const display = formatDisplay(from, to);
  const hasValue = Boolean(from || to);

  function pick(day: Date) {
    const key = toKey(day);
    if (!draftFrom || (draftFrom && draftTo)) {
      setDraftFrom(key);
      setDraftTo("");
      return;
    }
    let nextFrom = draftFrom;
    let nextTo = key;
    if (isBefore(parseISO(key), parseISO(draftFrom))) {
      nextFrom = key;
      nextTo = draftFrom;
    }
    setDraftFrom(nextFrom);
    setDraftTo(nextTo);
    onChange(nextFrom, nextTo);
    setOpen(false);
  }

  function clear(e: MouseEvent) {
    e.stopPropagation();
    onChange("", "");
    setDraftFrom("");
    setDraftTo("");
  }

  function dayClass(day: Date) {
    const key = toKey(day);
    const inMonth = isSameMonth(day, month);
    const start = draftFrom ? parseISO(draftFrom) : null;
    const end = draftTo ? parseISO(draftTo) : null;
    const isStart = start ? isSameDay(day, start) : false;
    const isEnd = end ? isSameDay(day, end) : false;
    const inRange =
      start &&
      end &&
      !isBefore(day, start) &&
      !isAfter(day, end) &&
      !isStart &&
      !isEnd;

    const parts = [
      "flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-colors",
    ];
    if (!inMonth) parts.push("text-[var(--muted)]/45");
    else parts.push("text-[var(--fg)]");
    if (inRange) parts.push("bg-[var(--accent-soft)] rounded-none");
    if (isStart || isEnd) {
      parts.push("bg-[var(--accent)] text-white");
    } else if (inMonth) {
      parts.push("hover:bg-[var(--accent-soft)]");
    }
    if (isStart && end) parts.push("rounded-r-none");
    if (isEnd && start) parts.push("rounded-l-none");
    if (key === toKey(new Date()) && !isStart && !isEnd && !inRange) {
      parts.push("ring-2 ring-[var(--accent)] ring-inset");
    }
    return parts.join(" ");
  }

  return (
    <div className={`field relative ${className ?? ""}`} ref={rootRef}>
      <label htmlFor={fieldId}>{label}</label>
      <div className="relative">
        <button
          id={fieldId}
          type="button"
          className={`flex w-full min-w-[14rem] items-center gap-2 rounded-[var(--radius-sm)] border-2 border-[var(--border)] bg-[var(--bg-elevated)] py-[0.65rem] pr-3 pl-[0.75rem] text-left font-medium text-[var(--fg)] outline-none focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--accent)_28%,transparent)] ${hasValue ? "pr-9" : ""}`}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <CalendarDays
            className="size-4 shrink-0 text-[var(--muted)]"
            aria-hidden
          />
          <span
            className={
              display ? "truncate" : "truncate text-[var(--muted)]"
            }
          >
            {display || "Von – Bis"}
          </span>
        </button>
        {hasValue && (
          <button
            type="button"
            className="absolute top-1/2 right-2 flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-[var(--muted)] hover:bg-[var(--panel-muted)] hover:text-[var(--fg)]"
            aria-label="Datumsfilter zurücksetzen"
            onClick={clear}
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {open && (
        <div
          role="dialog"
          aria-label={`${label}: Zeitraum wählen`}
          className="absolute top-[calc(100%+0.35rem)] left-0 z-40 w-[17.5rem] rounded-[var(--radius)] border-2 border-[var(--border)] bg-[var(--bg-elevated)] p-3 shadow-[var(--shadow)]"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <button
              type="button"
              className="flex size-8 items-center justify-center rounded-full hover:bg-[var(--panel-muted)]"
              aria-label="Vorheriger Monat"
              onClick={() => setMonth((m) => addMonths(m, -1))}
            >
              <ChevronLeft className="size-4" />
            </button>
            <p className="text-sm font-bold capitalize">
              {format(month, "LLLL yyyy", { locale: de })}
            </p>
            <button
              type="button"
              className="flex size-8 items-center justify-center rounded-full hover:bg-[var(--panel-muted)]"
              aria-label="Nächster Monat"
              onClick={() => setMonth((m) => addMonths(m, 1))}
            >
              <ChevronRight className="size-4" />
            </button>
          </div>

          <div className="mb-1 grid grid-cols-7 gap-y-1 text-center text-[0.7rem] font-bold text-[var(--muted)]">
            {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-y-1 place-items-center">
            {days.map((day) => (
              <button
                key={toKey(day)}
                type="button"
                className={dayClass(day)}
                onClick={() => pick(day)}
              >
                {format(day, "d")}
              </button>
            ))}
          </div>

          <p className="mt-3 text-center text-xs text-[var(--muted)]">
            {draftFrom && !draftTo
              ? "Jetzt Enddatum wählen"
              : "Startdatum, dann Enddatum tippen"}
          </p>
        </div>
      )}
    </div>
  );
}
