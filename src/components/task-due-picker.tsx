"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isPast,
  isSameDay,
  isSameMonth,
  isToday,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { de } from "date-fns/locale";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { updateTask } from "@/lib/actions";

function dueTone(dueAt: Date) {
  if (isToday(dueAt)) return "warn" as const;
  if (isPast(dueAt)) return "late" as const;
  return "ok" as const;
}

function dueText(dueAt: Date) {
  if (isToday(dueAt)) return "Heute";
  return format(dueAt, "d. MMM", { locale: de });
}

function toDateValue(dueAt: Date | string | null): Date | null {
  if (!dueAt) return null;
  const date = typeof dueAt === "string" ? new Date(dueAt) : dueAt;
  if (Number.isNaN(date.getTime())) return null;
  return startOfDay(date);
}

export function TaskDuePicker({
  taskId,
  dueAt,
  compact = true,
}: {
  taskId: string;
  dueAt: Date | string | null;
  compact?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const selected = toDateValue(dueAt);

  useEffect(() => {
    if (open) {
      setMonth(startOfMonth(selected ?? new Date()));
    }
  }, [open, selected]);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) {
      setPos(null);
      return;
    }
    function updatePos() {
      const btn = buttonRef.current;
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      const width = 280;
      const left = Math.min(
        Math.max(8, r.left),
        window.innerWidth - width - 8,
      );
      setPos({ top: r.bottom + 6, left });
    }
    updatePos();
    window.addEventListener("scroll", updatePos, true);
    window.addEventListener("resize", updatePos);
    return () => {
      window.removeEventListener("scroll", updatePos, true);
      window.removeEventListener("resize", updatePos);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [month]);

  function saveDue(next: Date | null) {
    const fd = new FormData();
    fd.set("id", taskId);
    fd.set("dueAt", next ? format(next, "yyyy-MM-dd") : "");
    startTransition(async () => {
      const result = await updateTask(fd);
      setOpen(false);
      if (result && "error" in result && result.error) return;
      router.refresh();
    });
  }

  const tone = selected ? dueTone(selected) : null;

  const trigger = selected ? (
    <button
      ref={buttonRef}
      type="button"
      disabled={pending}
      aria-label={`Fällig ${dueText(selected)}, Datum ändern`}
      aria-expanded={open}
      className={[
        "shrink-0 rounded-md px-1.5 py-0.5 text-left transition hover:bg-black/5 disabled:opacity-60",
        compact ? "text-[0.7rem]" : "text-xs",
        tone === "late"
          ? "text-[var(--danger)]"
          : tone === "warn"
            ? "text-[var(--warn,#9a6700)]"
            : "text-[var(--muted)]",
      ].join(" ")}
      onClick={(e) => {
        e.stopPropagation();
        setOpen((v) => !v);
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {dueText(selected)}
    </button>
  ) : (
    <button
      ref={buttonRef}
      type="button"
      disabled={pending}
      aria-label="Fälligkeitsdatum setzen"
      aria-expanded={open}
      title="Fälligkeitsdatum"
      className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-dashed border-[var(--border)] text-[var(--muted)] transition hover:border-[var(--fg)] hover:text-[var(--fg)] disabled:opacity-60"
      onClick={(e) => {
        e.stopPropagation();
        setOpen((v) => !v);
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <Calendar className="size-3.5" strokeWidth={1.75} />
    </button>
  );

  const popover =
    open && pos
      ? createPortal(
          <div
            ref={popoverRef}
            role="dialog"
            aria-label="Fälligkeitsdatum"
            style={{ top: pos.top, left: pos.left, width: 280 }}
            className="fixed z-[80] rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3 shadow-[0_12px_40px_rgba(0,0,0,0.14)]"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <button
                type="button"
                className="inline-flex size-7 items-center justify-center rounded-md text-[var(--muted)] hover:bg-black/5 hover:text-[var(--fg)]"
                aria-label="Vorheriger Monat"
                onClick={() => setMonth((m) => subMonths(m, 1))}
              >
                <ChevronLeft className="size-4" strokeWidth={1.75} />
              </button>
              <p className="text-sm font-semibold capitalize">
                {format(month, "MMMM yyyy", { locale: de })}
              </p>
              <button
                type="button"
                className="inline-flex size-7 items-center justify-center rounded-md text-[var(--muted)] hover:bg-black/5 hover:text-[var(--fg)]"
                aria-label="Nächster Monat"
                onClick={() => setMonth((m) => addMonths(m, 1))}
              >
                <ChevronRight className="size-4" strokeWidth={1.75} />
              </button>
            </div>

            <div className="mb-1 grid grid-cols-7 gap-0.5 text-center text-[0.65rem] font-semibold tracking-wide text-[var(--muted)] uppercase">
              {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((d) => (
                <span key={d} className="py-1">
                  {d}
                </span>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-0.5">
              {days.map((day) => {
                const inMonth = isSameMonth(day, month);
                const isSelected = selected ? isSameDay(day, selected) : false;
                const isTodayDay = isToday(day);
                return (
                  <button
                    key={day.toISOString()}
                    type="button"
                    disabled={pending}
                    onClick={() => saveDue(day)}
                    className={[
                      "flex aspect-square items-center justify-center rounded-full text-sm transition",
                      inMonth ? "text-[var(--fg)]" : "text-[var(--muted)]/45",
                      isSelected
                        ? "bg-[var(--accent)] font-semibold text-white"
                        : isTodayDay
                          ? "ring-1 ring-[var(--accent)] ring-inset"
                          : "hover:bg-black/5",
                    ].join(" ")}
                  >
                    {format(day, "d")}
                  </button>
                );
              })}
            </div>

            <div className="mt-2 flex items-center justify-between border-t border-[var(--border)] pt-2">
              <button
                type="button"
                disabled={pending}
                className="rounded-md px-2 py-1 text-xs font-semibold text-[var(--accent)] hover:bg-black/5 disabled:opacity-60"
                onClick={() => saveDue(startOfDay(new Date()))}
              >
                Heute
              </button>
              <button
                type="button"
                disabled={pending || !selected}
                className="rounded-md px-2 py-1 text-xs font-medium text-[var(--muted)] hover:text-[var(--fg)] disabled:opacity-40"
                onClick={() => saveDue(null)}
              >
                Wert löschen
              </button>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      {trigger}
      {popover}
    </>
  );
}
