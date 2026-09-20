"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addMonths,
  addWeeks,
  format,
  parseISO,
} from "date-fns";
import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import {
  archiveEditorialCalendarEvent,
  clearEditorialCalendarPendingDate,
  createEditorialCalendarCategory,
  createEditorialCalendarEvent,
  setEditorialCalendarPendingDate,
  updateEditorialCalendarEvent,
} from "@/lib/actions";
import {
  allowedDateModes,
  DATE_MODE_LABELS,
  daysInMonthGrid,
  daysInWeek,
  formatMonthTitle,
  formatWeekTitle,
  FREQUENCY_LABELS,
  listOccurrencesInYear,
  monthLabelsForYear,
  NTH_OPTIONS,
  parseDateKey,
  parseMonthKey,
  startOfIsoWeek,
  WEEKDAY_OPTIONS,
  type CalendarCategoryOption,
  type CalendarDateMode,
  type CalendarEventDetail,
  type CalendarEventFields,
  type CalendarFrequency,
  type CalendarViewMode,
  type PendingEvent,
} from "@/lib/editorial-calendar-shared";

type OccurrenceChip = {
  eventId: string;
  dateKey: string;
  title: string;
  note: string | null;
  frequency: CalendarFrequency;
  dateMode: CalendarDateMode;
  category: { id: string; name: string; color: string } | null;
};

type Props = {
  year: number;
  view: CalendarViewMode;
  monthKey: string;
  weekStartKey: string;
  occurrences: OccurrenceChip[];
  pending: PendingEvent[];
  events: CalendarEventDetail[];
  categories: CalendarCategoryOption[];
};

type FormState = {
  id: string | null;
  title: string;
  note: string;
  categoryId: string;
  frequency: CalendarFrequency;
  dateMode: CalendarDateMode;
  date: string;
  day: string;
  month: string;
  ruleWeekday: string;
  ruleNth: string;
  ruleMonth: string;
  intervalYears: string;
  anchorYear: string;
  /** Optional first concrete date when dateMode is pending */
  occurrenceDate: string;
};

type Panel = "event" | "pending" | "category" | "day" | null;

const DEFAULT_COLOR = "#94a3b8";
const WEEKDAY_SHORT = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

function emptyForm(year: number, dateKey?: string): FormState {
  return {
    id: null,
    title: "",
    note: "",
    categoryId: "",
    frequency: "once",
    dateMode: "fixed",
    date: dateKey ?? `${year}-01-01`,
    day: "1",
    month: "1",
    ruleWeekday: "6",
    ruleNth: "-1",
    ruleMonth: "10",
    intervalYears: "4",
    anchorYear: String(year),
    occurrenceDate: dateKey ?? "",
  };
}

function formFromEvent(event: CalendarEventDetail, year: number): FormState {
  return {
    id: event.id,
    title: event.title,
    note: event.note ?? "",
    categoryId: event.categoryId ?? "",
    frequency: event.frequency,
    dateMode: event.dateMode,
    date: event.dateKey ?? event.occurrenceDateKey ?? `${year}-01-01`,
    day: event.day != null ? String(event.day) : "1",
    month: event.month != null ? String(event.month) : "1",
    ruleWeekday: event.ruleWeekday != null ? String(event.ruleWeekday) : "6",
    ruleNth: event.ruleNth != null ? String(event.ruleNth) : "-1",
    ruleMonth:
      event.ruleMonth != null
        ? String(event.ruleMonth)
        : event.month != null
          ? String(event.month)
          : "10",
    intervalYears:
      event.intervalYears != null ? String(event.intervalYears) : "4",
    anchorYear:
      event.anchorYear != null ? String(event.anchorYear) : String(year),
    occurrenceDate: event.occurrenceDateKey ?? "",
  };
}

function fieldsFromForm(form: FormState): CalendarEventFields {
  return {
    frequency: form.frequency,
    dateMode: form.dateMode,
    date: form.date ? parseDateKey(form.date) : null,
    day: form.day ? Number.parseInt(form.day, 10) : null,
    month: form.month ? Number.parseInt(form.month, 10) : null,
    ruleWeekday: form.ruleWeekday
      ? Number.parseInt(form.ruleWeekday, 10)
      : null,
    ruleNth: form.ruleNth ? Number.parseInt(form.ruleNth, 10) : null,
    ruleMonth: form.ruleMonth ? Number.parseInt(form.ruleMonth, 10) : null,
    intervalYears: form.intervalYears
      ? Number.parseInt(form.intervalYears, 10)
      : null,
    anchorYear: form.anchorYear
      ? Number.parseInt(form.anchorYear, 10)
      : null,
  };
}

function appendFormData(form: FormState, planningYear: number): FormData {
  const fd = new FormData();
  if (form.id) fd.set("id", form.id);
  fd.set("title", form.title);
  fd.set("note", form.note);
  fd.set("categoryId", form.categoryId);
  fd.set("frequency", form.frequency);
  fd.set("dateMode", form.dateMode);
  fd.set("date", form.date);
  fd.set("day", form.day);
  fd.set("month", form.month);
  fd.set("ruleWeekday", form.ruleWeekday);
  fd.set("ruleNth", form.ruleNth);
  fd.set("ruleMonth", form.ruleMonth);
  fd.set("intervalYears", form.intervalYears);
  fd.set("anchorYear", form.anchorYear);
  if (form.dateMode === "pending" && form.occurrenceDate) {
    fd.set("occurrenceDate", form.occurrenceDate);
    fd.set("occurrenceYear", String(planningYear));
  }
  return fd;
}

function calendarHref(opts: {
  view: CalendarViewMode;
  year: number;
  monthKey: string;
  weekStartKey: string;
}): string {
  const params = new URLSearchParams();
  params.set("view", opts.view);
  if (opts.view === "year") {
    params.set("year", String(opts.year));
  } else if (opts.view === "week") {
    params.set("week", opts.weekStartKey);
    params.set("year", String(opts.year));
  } else {
    params.set("month", opts.monthKey);
    params.set("year", String(opts.year));
  }
  return `/jahreskalender?${params.toString()}`;
}

const inputClass =
  "w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)]";
const labelClass = "mb-1 block text-xs font-semibold text-[var(--muted)]";

function EventChip({
  event,
  compact = false,
  onClick,
}: {
  event: OccurrenceChip;
  compact?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={[
        "w-full truncate rounded text-left font-semibold leading-tight hover:opacity-90",
        compact ? "px-0.5 text-[0.6rem]" : "px-1.5 py-0.5 text-xs",
      ].join(" ")}
      style={{
        background: `${event.category?.color ?? DEFAULT_COLOR}66`,
        color: "#0a0a0a",
      }}
      title={event.title}
    >
      {event.title}
    </button>
  );
}

export function EditorialYearCalendar({
  year,
  view,
  monthKey,
  weekStartKey,
  occurrences,
  pending,
  events,
  categories,
}: Props) {
  const router = useRouter();
  const [pendingTx, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [dayDetailKey, setDayDetailKey] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => emptyForm(year));
  const [pendingSchedule, setPendingSchedule] = useState<{
    eventId: string;
    title: string;
    date: string;
    note: string;
  } | null>(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryColor, setNewCategoryColor] = useState("#d4edc0");

  const byDate = useMemo(() => {
    const map = new Map<string, OccurrenceChip[]>();
    for (const o of occurrences) {
      const list = map.get(o.dateKey) ?? [];
      list.push(o);
      map.set(o.dateKey, list);
    }
    return map;
  }, [occurrences]);

  const eventById = useMemo(() => {
    const map = new Map<string, CalendarEventDetail>();
    for (const e of events) map.set(e.id, e);
    return map;
  }, [events]);

  const months = monthLabelsForYear(year);
  const activeCategories = categories.filter((c) => c.active);
  const monthParts = parseMonthKey(monthKey) ?? {
    year,
    month: new Date().getMonth() + 1,
  };
  const weekStart = startOfIsoWeek(parseISO(weekStartKey));
  const todayKey = format(new Date(), "yyyy-MM-dd");
  const todayMonthKey = format(new Date(), "yyyy-MM");
  const todayWeekKey = format(startOfIsoWeek(new Date()), "yyyy-MM-dd");
  const todayYear = new Date().getFullYear();

  const previewDates = useMemo(() => {
    if (form.dateMode === "pending") return [];
    return listOccurrencesInYear(fieldsFromForm(form), year).slice(0, 8);
  }, [form, year]);

  const title =
    view === "year"
      ? String(year)
      : view === "week"
        ? formatWeekTitle(weekStart)
        : formatMonthTitle(monthParts.year, monthParts.month);

  const isCurrentPeriod =
    view === "year"
      ? year === todayYear
      : view === "week"
        ? weekStartKey === todayWeekKey
        : monthKey === todayMonthKey;

  function hrefFor(
    next: Partial<{
      view: CalendarViewMode;
      year: number;
      monthKey: string;
      weekStartKey: string;
    }>,
  ) {
    return calendarHref({
      view: next.view ?? view,
      year: next.year ?? year,
      monthKey: next.monthKey ?? monthKey,
      weekStartKey: next.weekStartKey ?? weekStartKey,
    });
  }

  function prevHref() {
    if (view === "year") {
      return hrefFor({ year: year - 1 });
    }
    if (view === "week") {
      const prev = addWeeks(weekStart, -1);
      return hrefFor({
        year: prev.getFullYear(),
        weekStartKey: format(prev, "yyyy-MM-dd"),
        monthKey: format(prev, "yyyy-MM"),
      });
    }
    const prev = addMonths(
      new Date(monthParts.year, monthParts.month - 1, 1),
      -1,
    );
    return hrefFor({
      year: prev.getFullYear(),
      monthKey: format(prev, "yyyy-MM"),
      weekStartKey: format(startOfIsoWeek(prev), "yyyy-MM-dd"),
    });
  }

  function nextHref() {
    if (view === "year") {
      return hrefFor({ year: year + 1 });
    }
    if (view === "week") {
      const next = addWeeks(weekStart, 1);
      return hrefFor({
        year: next.getFullYear(),
        weekStartKey: format(next, "yyyy-MM-dd"),
        monthKey: format(next, "yyyy-MM"),
      });
    }
    const next = addMonths(
      new Date(monthParts.year, monthParts.month - 1, 1),
      1,
    );
    return hrefFor({
      year: next.getFullYear(),
      monthKey: format(next, "yyyy-MM"),
      weekStartKey: format(startOfIsoWeek(next), "yyyy-MM-dd"),
    });
  }

  function todayHref() {
    const now = new Date();
    if (view === "year") {
      return hrefFor({
        view: "year",
        year: now.getFullYear(),
        monthKey: format(now, "yyyy-MM"),
        weekStartKey: format(startOfIsoWeek(now), "yyyy-MM-dd"),
      });
    }
    if (view === "week") {
      const start = startOfIsoWeek(now);
      return hrefFor({
        view: "week",
        year: start.getFullYear(),
        weekStartKey: format(start, "yyyy-MM-dd"),
        monthKey: format(start, "yyyy-MM"),
      });
    }
    return hrefFor({
      view: "month",
      year: now.getFullYear(),
      monthKey: format(now, "yyyy-MM"),
      weekStartKey: format(startOfIsoWeek(now), "yyyy-MM-dd"),
    });
  }

  function openCreate(dateKey?: string) {
    setError(null);
    setDayDetailKey(null);
    setForm(emptyForm(year, dateKey));
    setPanel("event");
  }

  function openEdit(eventId: string) {
    const event = eventById.get(eventId);
    if (!event) return;
    setError(null);
    setDayDetailKey(null);
    setForm(formFromEvent(event, year));
    setPanel("event");
  }

  function openDay(dateKey: string) {
    const dayEvents = byDate.get(dateKey) ?? [];
    if (dayEvents.length === 0) {
      openCreate(dateKey);
      return;
    }
    if (dayEvents.length === 1) {
      openEdit(dayEvents[0].eventId);
      return;
    }
    setDayDetailKey(dateKey);
    setPanel("day");
  }

  function openPending(p: PendingEvent) {
    setError(null);
    setPendingSchedule({
      eventId: p.id,
      title: p.title,
      date: `${year}-06-01`,
      note: p.note ?? "",
    });
    setPanel("pending");
  }

  function setFrequency(frequency: CalendarFrequency) {
    const modes = allowedDateModes(frequency);
    setForm((f) => ({
      ...f,
      frequency,
      dateMode: modes.includes(f.dateMode) ? f.dateMode : modes[0],
    }));
  }

  function setDateMode(dateMode: CalendarDateMode) {
    setForm((f) => {
      const next = { ...f, dateMode };
      // When switching to pending, keep a concrete date offer from the once-date field
      if (
        dateMode === "pending" &&
        !f.occurrenceDate &&
        f.date &&
        f.date.startsWith(String(year))
      ) {
        next.occurrenceDate = f.date;
      }
      return next;
    });
  }

  function saveEvent() {
    setError(null);
    startTransition(async () => {
      const fd = appendFormData(form, year);
      const result = form.id
        ? await updateEditorialCalendarEvent(fd)
        : await createEditorialCalendarEvent(fd);
      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }
      setPanel(null);
      router.refresh();
    });
  }

  function archiveEvent() {
    if (!form.id) return;
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", form.id!);
      const result = await archiveEditorialCalendarEvent(fd);
      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }
      setPanel(null);
      router.refresh();
    });
  }

  function savePendingDate() {
    if (!pendingSchedule) return;
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("eventId", pendingSchedule.eventId);
      fd.set("year", String(year));
      fd.set("date", pendingSchedule.date);
      fd.set("note", pendingSchedule.note);
      const result = await setEditorialCalendarPendingDate(fd);
      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }
      setPanel(null);
      setPendingSchedule(null);
      router.refresh();
    });
  }

  function clearPending(eventId: string) {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("eventId", eventId);
      fd.set("year", String(year));
      await clearEditorialCalendarPendingDate(fd);
      router.refresh();
    });
  }

  function saveCategory() {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("name", newCategoryName);
      fd.set("color", newCategoryColor);
      const result = await createEditorialCalendarCategory(fd);
      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }
      setNewCategoryName("");
      setPanel(null);
      router.refresh();
    });
  }

  const dateModes = allowedDateModes(form.frequency);
  const dayDetailEvents = dayDetailKey
    ? (byDate.get(dayDetailKey) ?? [])
    : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl border border-black/10 bg-white p-0.5">
            {(
              [
                ["month", "Monat"],
                ["week", "Woche"],
                ["year", "Jahr"],
              ] as const
            ).map(([id, label]) => (
              <Link
                key={id}
                href={hrefFor({
                  view: id,
                  year:
                    id === "year"
                      ? year
                      : id === "week"
                        ? weekStart.getFullYear()
                        : monthParts.year,
                })}
                className={[
                  "rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors",
                  view === id
                    ? "bg-[var(--highlight)] text-[#0a0a0a]"
                    : "text-[var(--muted)] hover:bg-black/5 hover:text-[var(--fg)]",
                ].join(" ")}
              >
                {label}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-1">
            <Link
              href={prevHref()}
              className="inline-flex size-9 items-center justify-center rounded-xl border border-black/10 bg-white hover:bg-black/5"
              aria-label="Zurück"
            >
              <ChevronLeft className="size-4" />
            </Link>
            <h2 className="min-w-[9rem] px-1 text-center font-[family-name:var(--font-display)] text-lg font-semibold capitalize tabular-nums sm:min-w-[12rem] sm:text-xl">
              {title}
            </h2>
            <Link
              href={nextHref()}
              className="inline-flex size-9 items-center justify-center rounded-xl border border-black/10 bg-white hover:bg-black/5"
              aria-label="Weiter"
            >
              <ChevronRight className="size-4" />
            </Link>
          </div>

          {!isCurrentPeriod && (
            <Link
              href={todayHref()}
              className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-medium hover:bg-black/5"
            >
              Heute
            </Link>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setError(null);
              setPanel("category");
            }}
            className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-medium hover:bg-black/5"
          >
            Kategorie
          </button>
          <button
            type="button"
            onClick={() => openCreate(todayKey)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--highlight)] px-3 py-2 text-sm font-bold text-[#0a0a0a]"
          >
            <Plus className="size-4" />
            Event
          </button>
        </div>
      </div>

      {pending.length > 0 && (
        <section className="card space-y-3 p-4">
          <div>
            <h3 className="text-sm font-bold tracking-wide uppercase">
              Noch einzuplanen ({year})
            </h3>
            <p className="text-xs text-[var(--muted)]">
              Wiederkehrende Events ohne Datum für dieses Jahr.
            </p>
          </div>
          <ul className="space-y-2">
            {pending.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-black/8 bg-white/60 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{
                        background: p.category?.color ?? DEFAULT_COLOR,
                      }}
                    />
                    <span className="truncate text-sm font-semibold">
                      {p.title}
                    </span>
                  </div>
                  {p.note && (
                    <p className="mt-0.5 truncate text-xs text-[var(--muted)]">
                      {p.note}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => openEdit(p.id)}
                    className="rounded-lg px-2 py-1 text-xs font-medium text-[var(--muted)] hover:bg-black/5"
                  >
                    Bearbeiten
                  </button>
                  <button
                    type="button"
                    onClick={() => openPending(p)}
                    className="rounded-lg bg-[var(--highlight)] px-2.5 py-1 text-xs font-bold text-[#0a0a0a]"
                  >
                    Datum setzen
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {view === "month" && (
        <div className="card overflow-hidden p-3 sm:p-4">
          <div className="mb-2 grid grid-cols-7 gap-1 text-center text-xs font-semibold text-[var(--muted)]">
            {WEEKDAY_SHORT.map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {daysInMonthGrid(monthParts.year, monthParts.month).map(
              (cell, idx) => {
                if (!cell.inMonth || !cell.dateKey) {
                  return (
                    <div
                      key={`pad-${idx}`}
                      className="min-h-[5.5rem] rounded-lg bg-transparent"
                    />
                  );
                }
                const dayEvents = byDate.get(cell.dateKey) ?? [];
                const isToday = cell.dateKey === todayKey;
                return (
                  <button
                    key={cell.dateKey}
                    type="button"
                    onClick={() => openDay(cell.dateKey!)}
                    className={[
                      "flex min-h-[5.5rem] flex-col gap-0.5 rounded-lg border p-1.5 text-left transition-colors hover:border-black/20 hover:bg-black/[0.03]",
                      isToday
                        ? "border-[var(--accent)] bg-[var(--accent)]/5"
                        : "border-black/8 bg-white/70",
                    ].join(" ")}
                  >
                    <span
                      className={[
                        "text-xs font-semibold tabular-nums",
                        isToday
                          ? "text-[var(--accent)]"
                          : "text-[var(--muted)]",
                      ].join(" ")}
                    >
                      {cell.day}
                    </span>
                    <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden">
                      {dayEvents.slice(0, 3).map((e) => (
                        <EventChip
                          key={`${e.eventId}-${e.dateKey}`}
                          event={e}
                          compact
                          onClick={() => openEdit(e.eventId)}
                        />
                      ))}
                      {dayEvents.length > 3 && (
                        <span className="px-0.5 text-[0.6rem] font-medium text-[var(--muted)]">
                          +{dayEvents.length - 3} weitere
                        </span>
                      )}
                    </div>
                  </button>
                );
              },
            )}
          </div>
        </div>
      )}

      {view === "week" && (
        <div className="grid gap-2 md:grid-cols-7">
          {daysInWeek(weekStart).map((day) => {
            const dayEvents = byDate.get(day.dateKey) ?? [];
            const isToday = day.dateKey === todayKey;
            return (
              <div
                key={day.dateKey}
                className={[
                  "card flex min-h-[12rem] flex-col gap-2 p-3",
                  isToday ? "ring-2 ring-[var(--accent)]" : "",
                ].join(" ")}
              >
                <button
                  type="button"
                  onClick={() => openDay(day.dateKey)}
                  className="text-left"
                >
                  <p className="text-xs font-semibold text-[var(--muted)]">
                    {day.weekdayLabel}
                  </p>
                  <p
                    className={[
                      "font-[family-name:var(--font-display)] text-xl font-semibold tabular-nums",
                      isToday ? "text-[var(--accent)]" : "",
                    ].join(" ")}
                  >
                    {day.day}
                  </p>
                </button>
                <div className="flex flex-1 flex-col gap-1">
                  {dayEvents.map((e) => (
                    <EventChip
                      key={`${e.eventId}-${e.dateKey}`}
                      event={e}
                      onClick={() => openEdit(e.eventId)}
                    />
                  ))}
                  {dayEvents.length === 0 && (
                    <button
                      type="button"
                      onClick={() => openCreate(day.dateKey)}
                      className="mt-auto rounded-lg border border-dashed border-black/15 px-2 py-1.5 text-xs text-[var(--muted)] hover:bg-black/5"
                    >
                      + Event
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {view === "year" && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {months.map((m) => {
            const cells = daysInMonthGrid(year, m.month);
            return (
              <div key={m.monthKey} className="card overflow-hidden p-3">
                <Link
                  href={hrefFor({
                    view: "month",
                    year,
                    monthKey: m.monthKey,
                    weekStartKey: format(
                      startOfIsoWeek(new Date(year, m.month - 1, 1)),
                      "yyyy-MM-dd",
                    ),
                  })}
                  className="mb-2 block text-sm font-bold capitalize tracking-wide hover:text-[var(--accent)]"
                >
                  {m.label}
                </Link>
                <div className="mb-1 grid grid-cols-7 gap-px text-center text-[0.65rem] font-semibold text-[var(--muted)]">
                  {WEEKDAY_SHORT.map((d) => (
                    <div key={d}>{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-px">
                  {cells.map((cell, idx) => {
                    if (!cell.inMonth || !cell.dateKey) {
                      return (
                        <div
                          key={`pad-${m.month}-${idx}`}
                          className="min-h-8 rounded-sm"
                        />
                      );
                    }
                    const dayEvents = byDate.get(cell.dateKey) ?? [];
                    const isToday = cell.dateKey === todayKey;
                    return (
                      <button
                        key={cell.dateKey}
                        type="button"
                        onClick={() => openDay(cell.dateKey!)}
                        title={
                          dayEvents.length
                            ? dayEvents.map((e) => e.title).join(", ")
                            : "Event hinzufügen"
                        }
                        className={[
                          "min-h-8 rounded-sm p-0.5 text-left hover:bg-black/[0.04]",
                          isToday ? "ring-1 ring-[var(--accent)]" : "",
                        ].join(" ")}
                      >
                        <div className="text-[0.65rem] font-medium tabular-nums leading-none text-[var(--muted)]">
                          {cell.day}
                        </div>
                        {dayEvents.length > 0 && (
                          <div className="mt-0.5 flex flex-wrap gap-0.5">
                            {dayEvents.slice(0, 3).map((e) => (
                              <span
                                key={`${e.eventId}-dot`}
                                className="size-1.5 rounded-full"
                                style={{
                                  background:
                                    e.category?.color ?? DEFAULT_COLOR,
                                }}
                              />
                            ))}
                            {dayEvents.length > 3 && (
                              <span className="text-[0.5rem] text-[var(--muted)]">
                                +{dayEvents.length - 3}
                              </span>
                            )}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {panel && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center">
          <div
            role="dialog"
            aria-modal
            className="card max-h-[90vh] w-full max-w-lg overflow-y-auto p-4 shadow-xl"
          >
            <div className="mb-3 flex items-start justify-between gap-2">
              <h3 className="font-[family-name:var(--font-display)] text-lg font-semibold">
                {panel === "category"
                  ? "Kategorie anlegen"
                  : panel === "pending"
                    ? "Datum setzen"
                    : panel === "day"
                      ? dayDetailKey
                        ? format(parseISO(dayDetailKey), "d. MMMM yyyy")
                        : "Tag"
                      : form.id
                        ? "Event bearbeiten"
                        : "Neues Event"}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setPanel(null);
                  setDayDetailKey(null);
                  setError(null);
                }}
                className="rounded-lg p-1 hover:bg-black/5"
                aria-label="Schliessen"
              >
                <X className="size-4" />
              </button>
            </div>

            {error && (
              <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}

            {panel === "day" && dayDetailKey && (
              <div className="space-y-3">
                <ul className="space-y-2">
                  {dayDetailEvents.map((e) => (
                    <li key={e.eventId}>
                      <button
                        type="button"
                        onClick={() => openEdit(e.eventId)}
                        className="flex w-full items-start gap-2 rounded-xl border border-black/10 px-3 py-2 text-left hover:bg-black/[0.03]"
                      >
                        <span
                          className="mt-1.5 size-2.5 shrink-0 rounded-full"
                          style={{
                            background: e.category?.color ?? DEFAULT_COLOR,
                          }}
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold">
                            {e.title}
                          </span>
                          {e.note && (
                            <span className="mt-0.5 block text-xs text-[var(--muted)]">
                              {e.note}
                            </span>
                          )}
                          {e.category && (
                            <span className="mt-0.5 block text-[0.65rem] text-[var(--muted)]">
                              {e.category.name}
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => openCreate(dayDetailKey)}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-[var(--highlight)] px-3 py-2 text-sm font-bold text-[#0a0a0a]"
                >
                  <Plus className="size-4" />
                  Weiteres Event an diesem Tag
                </button>
              </div>
            )}

            {panel === "category" && (
              <div className="space-y-3">
                <div>
                  <label className={labelClass} htmlFor="cat-name">
                    Name
                  </label>
                  <input
                    id="cat-name"
                    className={inputClass}
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor="cat-color">
                    Farbe
                  </label>
                  <input
                    id="cat-color"
                    type="color"
                    className="h-10 w-full cursor-pointer rounded-lg border border-black/10"
                    value={newCategoryColor}
                    onChange={(e) => setNewCategoryColor(e.target.value)}
                  />
                </div>
                {categories.length > 0 && (
                  <ul className="space-y-1 border-t border-black/10 pt-3">
                    {categories.map((c) => (
                      <li
                        key={c.id}
                        className="flex items-center gap-2 text-sm"
                      >
                        <span
                          className="size-3 rounded-full"
                          style={{ background: c.color }}
                        />
                        <span className={c.active ? "" : "opacity-50"}>
                          {c.name}
                          {!c.active ? " (inaktiv)" : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    disabled={pendingTx || !newCategoryName.trim()}
                    onClick={saveCategory}
                    className="rounded-xl bg-[var(--highlight)] px-4 py-2 text-sm font-bold text-[#0a0a0a] disabled:opacity-50"
                  >
                    Speichern
                  </button>
                </div>
              </div>
            )}

            {panel === "pending" && pendingSchedule && (
              <div className="space-y-3">
                <p className="text-sm">
                  <span className="font-semibold">{pendingSchedule.title}</span>
                  {" · "}
                  {year}
                </p>
                <div>
                  <label className={labelClass} htmlFor="pending-date">
                    Datum
                  </label>
                  <input
                    id="pending-date"
                    type="date"
                    className={inputClass}
                    value={pendingSchedule.date}
                    onChange={(e) =>
                      setPendingSchedule((s) =>
                        s ? { ...s, date: e.target.value } : s,
                      )
                    }
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor="pending-note">
                    Notiz (optional)
                  </label>
                  <textarea
                    id="pending-note"
                    className={inputClass}
                    rows={3}
                    value={pendingSchedule.note}
                    onChange={(e) =>
                      setPendingSchedule((s) =>
                        s ? { ...s, note: e.target.value } : s,
                      )
                    }
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    disabled={pendingTx}
                    onClick={savePendingDate}
                    className="rounded-xl bg-[var(--highlight)] px-4 py-2 text-sm font-bold text-[#0a0a0a] disabled:opacity-50"
                  >
                    Einplanen
                  </button>
                </div>
              </div>
            )}

            {panel === "event" && (
              <div className="space-y-3">
                <div>
                  <label className={labelClass} htmlFor="ev-title">
                    Titel
                  </label>
                  <input
                    id="ev-title"
                    className={inputClass}
                    value={form.title}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, title: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor="ev-note">
                    Notiz
                  </label>
                  <textarea
                    id="ev-note"
                    className={inputClass}
                    rows={3}
                    value={form.note}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, note: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor="ev-cat">
                    Kategorie
                  </label>
                  <select
                    id="ev-cat"
                    className={inputClass}
                    value={form.categoryId}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, categoryId: e.target.value }))
                    }
                  >
                    <option value="">— keine —</option>
                    {activeCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass} htmlFor="ev-freq">
                      Wiederholung
                    </label>
                    <select
                      id="ev-freq"
                      className={inputClass}
                      value={form.frequency}
                      onChange={(e) =>
                        setFrequency(e.target.value as CalendarFrequency)
                      }
                    >
                      {(
                        Object.keys(FREQUENCY_LABELS) as CalendarFrequency[]
                      ).map((k) => (
                        <option key={k} value={k}>
                          {FREQUENCY_LABELS[k]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="ev-mode">
                      Datumsmodus
                    </label>
                    <select
                      id="ev-mode"
                      className={inputClass}
                      value={form.dateMode}
                      onChange={(e) =>
                        setDateMode(e.target.value as CalendarDateMode)
                      }
                    >
                      {dateModes.map((m) => (
                        <option key={m} value={m}>
                          {DATE_MODE_LABELS[m]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {form.frequency === "every_n_years" && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelClass} htmlFor="ev-interval">
                        Alle N Jahre
                      </label>
                      <input
                        id="ev-interval"
                        type="number"
                        min={2}
                        max={50}
                        className={inputClass}
                        value={form.intervalYears}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            intervalYears: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div>
                      <label className={labelClass} htmlFor="ev-anchor">
                        Bezugsjahr
                      </label>
                      <input
                        id="ev-anchor"
                        type="number"
                        min={2000}
                        max={2100}
                        className={inputClass}
                        value={form.anchorYear}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            anchorYear: e.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>
                )}

                {form.frequency === "once" && form.dateMode === "fixed" && (
                  <div>
                    <label className={labelClass} htmlFor="ev-date">
                      Datum
                    </label>
                    <input
                      id="ev-date"
                      type="date"
                      className={inputClass}
                      value={form.date}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, date: e.target.value }))
                      }
                    />
                  </div>
                )}

                {form.frequency === "weekly" && (
                  <div>
                    <label className={labelClass} htmlFor="ev-wd">
                      Wochentag
                    </label>
                    <select
                      id="ev-wd"
                      className={inputClass}
                      value={form.ruleWeekday}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          ruleWeekday: e.target.value,
                        }))
                      }
                    >
                      {WEEKDAY_OPTIONS.map((w) => (
                        <option key={w.value} value={w.value}>
                          {w.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {form.frequency === "monthly" && form.dateMode === "fixed" && (
                  <div>
                    <label className={labelClass} htmlFor="ev-day">
                      Tag im Monat
                    </label>
                    <input
                      id="ev-day"
                      type="number"
                      min={1}
                      max={31}
                      className={inputClass}
                      value={form.day}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, day: e.target.value }))
                      }
                    />
                  </div>
                )}

                {form.frequency === "monthly" && form.dateMode === "rule" && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelClass} htmlFor="ev-nth">
                        Position
                      </label>
                      <select
                        id="ev-nth"
                        className={inputClass}
                        value={form.ruleNth}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, ruleNth: e.target.value }))
                        }
                      >
                        {NTH_OPTIONS.map((n) => (
                          <option key={n.value} value={n.value}>
                            {n.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={labelClass} htmlFor="ev-wd-m">
                        Wochentag
                      </label>
                      <select
                        id="ev-wd-m"
                        className={inputClass}
                        value={form.ruleWeekday}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            ruleWeekday: e.target.value,
                          }))
                        }
                      >
                        {WEEKDAY_OPTIONS.map((w) => (
                          <option key={w.value} value={w.value}>
                            {w.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {(form.frequency === "yearly" ||
                  form.frequency === "every_n_years") &&
                  form.dateMode === "fixed" && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelClass} htmlFor="ev-month">
                          Monat
                        </label>
                        <select
                          id="ev-month"
                          className={inputClass}
                          value={form.month}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, month: e.target.value }))
                          }
                        >
                          {months.map((mo) => (
                            <option key={mo.month} value={mo.month}>
                              {mo.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className={labelClass} htmlFor="ev-yday">
                          Tag
                        </label>
                        <input
                          id="ev-yday"
                          type="number"
                          min={1}
                          max={31}
                          className={inputClass}
                          value={form.day}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, day: e.target.value }))
                          }
                        />
                      </div>
                    </div>
                  )}

                {(form.frequency === "yearly" ||
                  form.frequency === "every_n_years") &&
                  form.dateMode === "rule" && (
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className={labelClass} htmlFor="ev-rmonth">
                          Monat
                        </label>
                        <select
                          id="ev-rmonth"
                          className={inputClass}
                          value={form.ruleMonth}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              ruleMonth: e.target.value,
                              month: e.target.value,
                            }))
                          }
                        >
                          {months.map((mo) => (
                            <option key={mo.month} value={mo.month}>
                              {mo.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className={labelClass} htmlFor="ev-rnth">
                          Position
                        </label>
                        <select
                          id="ev-rnth"
                          className={inputClass}
                          value={form.ruleNth}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              ruleNth: e.target.value,
                            }))
                          }
                        >
                          {NTH_OPTIONS.map((n) => (
                            <option key={n.value} value={n.value}>
                              {n.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className={labelClass} htmlFor="ev-rwd">
                          Wochentag
                        </label>
                        <select
                          id="ev-rwd"
                          className={inputClass}
                          value={form.ruleWeekday}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              ruleWeekday: e.target.value,
                            }))
                          }
                        >
                          {WEEKDAY_OPTIONS.map((w) => (
                            <option key={w.value} value={w.value}>
                              {w.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}

                {form.dateMode === "pending" && (
                  <div className="space-y-2 rounded-lg bg-amber-50 px-3 py-3">
                    <p className="text-xs text-amber-900">
                      Das Event bleibt jährlich ohne fixes Datum. Optional kannst
                      du für {year} gleich ein erstes Datum setzen — sonst landet
                      es unter «Noch einzuplanen».
                    </p>
                    <div>
                      <label className={labelClass} htmlFor="ev-occ-date">
                        Datum {year} (optional)
                      </label>
                      <input
                        id="ev-occ-date"
                        type="date"
                        min={`${year}-01-01`}
                        max={`${year}-12-31`}
                        className={inputClass}
                        value={form.occurrenceDate}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            occurrenceDate: e.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>
                )}

                {previewDates.length > 0 && (
                  <p className="text-xs text-[var(--muted)]">
                    Vorschau {year}:{" "}
                    {previewDates
                      .map((d) =>
                        d.toLocaleDateString("de-CH", {
                          day: "numeric",
                          month: "short",
                        }),
                      )
                      .join(", ")}
                    {listOccurrencesInYear(fieldsFromForm(form), year).length >
                      8 && " …"}
                  </p>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                  <div>
                    {form.id && (
                      <button
                        type="button"
                        disabled={pendingTx}
                        onClick={archiveEvent}
                        className="rounded-lg px-3 py-2 text-sm text-red-700 hover:bg-red-50"
                      >
                        Archivieren
                      </button>
                    )}
                    {form.id &&
                      eventById.get(form.id)?.occurrenceDateKey && (
                        <button
                          type="button"
                          disabled={pendingTx}
                          onClick={() => clearPending(form.id!)}
                          className="ml-1 rounded-lg px-3 py-2 text-sm text-[var(--muted)] hover:bg-black/5"
                        >
                          Datum {year} entfernen
                        </button>
                      )}
                  </div>
                  <button
                    type="button"
                    disabled={pendingTx || !form.title.trim()}
                    onClick={saveEvent}
                    className="rounded-xl bg-[var(--highlight)] px-4 py-2 text-sm font-bold text-[#0a0a0a] disabled:opacity-50"
                  >
                    Speichern
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
