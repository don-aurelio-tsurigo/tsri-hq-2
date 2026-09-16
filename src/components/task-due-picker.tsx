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
import { useIsMobile } from "@/lib/use-media-query";

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
  const isMobile = useIsMobile();
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
    if (!open || !buttonRef.current || isMobile) {
      if (!open) setPos(null);
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
      const estimatedHeight = 340;
      const top =
        r.bottom + 6 + estimatedHeight > window.innerHeight - 8
          ? Math.max(8, r.top - estimatedHeight - 6)
          : r.bottom + 6;
      setPos({ top, left });
    }
    updatePos();
    window.addEventListener("scroll", updatePos, true);
    window.addEventListener("resize", updatePos);
    return () => {
      window.removeEventListener("scroll", updatePos, true);
      window.removeEventListener("resize", updatePos);
    };
  }, [open, isMobile]);

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
    const prev = document.body.style.overflow;
    if (isMobile) document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, isMobile]);

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
        "inline-flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-lg px-2 text-left transition hover:bg-black/5 disabled:opacity-60 sm:min-h-0 sm:min-w-0 sm:rounded-md sm:px-1.5 sm:py-0.5",
        compact ? "text-xs sm:text-[0.7rem]" : "text-xs",
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
      className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-dashed border-[var(--border)] text-[var(--muted)] transition hover:border-[var(--fg)] hover:text-[var(--fg)] disabled:opacity-60 sm:size-7"
      onClick={(e) => {
        e.stopPropagation();
        setOpen((v) => !v);
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <Calendar className="size-4 sm:size-3.5" strokeWidth={1.75} />
    </button>
  );

  const panel = (
    <div
      ref={popoverRef}
      role="dialog"
      aria-label="Fälligkeitsdatum"
      className={
        isMobile
          ? "fixed inset-x-0 bottom-0 z-[81] max-h-[85dvh] overflow-y-auto rounded-t-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-8px_40px_rgba(0,0,0,0.18)]"
          : "fixed z-[80] rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3 shadow-[0_12px_40px_rgba(0,0,0,0.14)]"
      }
      style={
        isMobile
          ? undefined
          : pos
            ? { top: pos.top, left: pos.left, width: 280 }
            : { display: "none" }
      }
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {isMobile && (
        <div className="mb-3 flex justify-center">
          <span className="h-1 w-10 rounded-full bg-[var(--border)]" aria-hidden />
        </div>
      )}
      <div className="mb-2 flex items-center justify-between gap-2">
        <button
          type="button"
          className="inline-flex size-10 items-center justify-center rounded-md text-[var(--muted)] hover:bg-black/5 hover:text-[var(--fg)] sm:size-7"
          aria-label="Vorheriger Monat"
          onClick={() => setMonth((m) => subMonths(m, 1))}
        >
          <ChevronLeft className="size-5 sm:size-4" strokeWidth={1.75} />
        </button>
        <p className="text-sm font-semibold capitalize">
          {format(month, "MMMM yyyy", { locale: de })}
        </p>
        <button
          type="button"
          className="inline-flex size-10 items-center justify-center rounded-md text-[var(--muted)] hover:bg-black/5 hover:text-[var(--fg)] sm:size-7"
          aria-label="Nächster Monat"
          onClick={() => setMonth((m) => addMonths(m, 1))}
        >
          <ChevronRight className="size-5 sm:size-4" strokeWidth={1.75} />
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
                "flex min-h-10 items-center justify-center rounded-full text-sm transition sm:min-h-0 sm:aspect-square",
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

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-[var(--border)] pt-3">
        <button
          type="button"
          disabled={pending}
          className="min-h-10 rounded-lg px-3 text-sm font-semibold text-[var(--accent)] hover:bg-black/5 disabled:opacity-60 sm:min-h-0 sm:rounded-md sm:px-2 sm:py-1 sm:text-xs"
          onClick={() => saveDue(startOfDay(new Date()))}
        >
          Heute
        </button>
        <button
          type="button"
          disabled={pending || !selected}
          className="min-h-10 rounded-lg px-3 text-sm font-medium text-[var(--muted)] hover:text-[var(--fg)] disabled:opacity-40 sm:min-h-0 sm:rounded-md sm:px-2 sm:py-1 sm:text-xs"
          onClick={() => saveDue(null)}
        >
          Wert löschen
        </button>
      </div>
    </div>
  );

  const popover =
    open && (isMobile || pos)
      ? createPortal(
          isMobile ? (
            <>
              <button
                type="button"
                aria-label="Schliessen"
                className="fixed inset-0 z-[80] bg-black/35"
                onClick={() => setOpen(false)}
              />
              {panel}
            </>
          ) : (
            panel
          ),
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
