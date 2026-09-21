"use client";

import Link from "next/link";
import { useMemo, useState, useTransition, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import {
  eachDayOfInterval,
  endOfMonth,
  format,
  isWeekend,
  startOfMonth,
} from "date-fns";
import { de } from "date-fns/locale";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import {
  archiveEditorialCalendarEvent,
  clearEditorialCalendarPendingDate,
  createEditorialCalendarCategory,
  createEditorialCalendarEvent,
  deleteEditorialCalendarCategory,
  setEditorialCalendarPendingDate,
  updateEditorialCalendarCategory,
  updateEditorialCalendarEvent,
} from "@/lib/actions";
import {
  allowedDateModes,
  DATE_MODE_LABELS,
  FREQUENCY_LABELS,
  listOccurrencesInYear,
  monthLabelsForYear,
  NTH_OPTIONS,
  parseDateKey,
  parseMonthKey,
  WEEKDAY_OPTIONS,
  type CalendarCategoryOption,
  type CalendarDateMode,
  type CalendarEventDetail,
  type CalendarEventFields,
  type CalendarFrequency,
  type PendingEvent,
} from "@/lib/editorial-calendar-shared";
import { normalizeWikiHref } from "@/lib/wiki-links";

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
  monthKey: string;
  monthLabel: string;
  prevMonth: string;
  nextMonth: string;
  currentMonth: string;
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
  occurrenceDate: string;
};

type Panel = "event" | "pending" | "category" | null;
type EventPanelMode = "view" | "edit";

const DEFAULT_COLOR = "#94a3b8";

const URL_IN_TEXT_RE = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/gi;

function LinkifiedText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const nodes: Array<string | ReactElement> = [];
  let lastIndex = 0;
  let key = 0;
  const re = new RegExp(URL_IN_TEXT_RE.source, URL_IN_TEXT_RE.flags);
  for (const match of text.matchAll(re)) {
    const raw = match[0];
    const index = match.index ?? 0;
    if (index > lastIndex) {
      nodes.push(text.slice(lastIndex, index));
    }
    let url = raw;
    let trailing = "";
    while (/[.,;:!?)]$/.test(url)) {
      trailing = `${url.slice(-1)}${trailing}`;
      url = url.slice(0, -1);
    }
    nodes.push(
      <a
        key={`url-${key++}`}
        href={normalizeWikiHref(url)}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-[var(--accent)] underline decoration-2 underline-offset-2 hover:opacity-80"
        onClick={(e) => e.stopPropagation()}
      >
        {url}
      </a>,
    );
    if (trailing) nodes.push(trailing);
    lastIndex = index + raw.length;
  }
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return <span className={className}>{nodes}</span>;
}

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

function scheduleSummary(
  frequency: CalendarFrequency,
  dateMode: CalendarDateMode,
): string {
  if (frequency === "once") return "Einmalig";
  const freq = FREQUENCY_LABELS[frequency];
  if (dateMode === "pending") return `${freq} · Datum offen`;
  if (dateMode === "rule") return `${freq} · Regel`;
  return freq;
}

function monthHref(month: string, categoryIds: string[] | null) {
  const params = new URLSearchParams();
  params.set("month", month);
  if (categoryIds && categoryIds.length > 0) {
    for (const id of categoryIds) params.append("category", id);
  }
  return `/jahreskalender?${params.toString()}`;
}

const inputClass =
  "w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)]";
const labelClass = "mb-1 block text-xs font-semibold text-[var(--muted)]";

export function EditorialYearCalendar({
  year,
  monthKey,
  monthLabel,
  prevMonth,
  nextMonth,
  currentMonth,
  occurrences,
  pending,
  events,
  categories,
}: Props) {
  const router = useRouter();
  const [pendingTx, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [eventMode, setEventMode] = useState<EventPanelMode>("edit");
  const [form, setForm] = useState<FormState>(() => emptyForm(year));
  const [pendingSchedule, setPendingSchedule] = useState<{
    eventId: string;
    title: string;
    date: string;
    note: string;
  } | null>(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryColor, setNewCategoryColor] = useState("#d4edc0");
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(
    null,
  );
  const [fromTodayOnly, setFromTodayOnly] = useState(true);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>(
    () => categories.filter((c) => c.active).map((c) => c.id),
  );

  const todayKey = format(new Date(), "yyyy-MM-dd");
  const viewingCurrentMonth = monthKey === currentMonth;
  const activeCategories = categories.filter((c) => c.active);
  const months = monthLabelsForYear(year);

  const eventById = useMemo(() => {
    const map = new Map<string, CalendarEventDetail>();
    for (const e of events) map.set(e.id, e);
    return map;
  }, [events]);

  const selectedSet = useMemo(
    () => new Set(selectedCategoryIds),
    [selectedCategoryIds],
  );

  const categoryFilterActive =
    activeCategories.length > 0 &&
    selectedCategoryIds.length > 0 &&
    selectedCategoryIds.length < activeCategories.length;

  const filteredDays = useMemo(() => {
    const parts = parseMonthKey(monthKey);
    if (!parts) return [];

    const byDate = new Map<string, OccurrenceChip[]>();
    for (const o of occurrences) {
      if (!o.dateKey.startsWith(monthKey)) continue;
      if (
        categoryFilterActive &&
        o.category &&
        !selectedSet.has(o.category.id)
      ) {
        continue;
      }
      if (categoryFilterActive && !o.category) {
        continue;
      }
      const list = byDate.get(o.dateKey) ?? [];
      list.push(o);
      byDate.set(o.dateKey, list);
    }

    const monthStart = startOfMonth(new Date(parts.year, parts.month - 1, 1));
    const monthEnd = endOfMonth(monthStart);
    return eachDayOfInterval({ start: monthStart, end: monthEnd })
      .map((d) => {
        const dateKey = format(d, "yyyy-MM-dd");
        return {
          dateKey,
          weekdayLabel: format(d, "EEEE", { locale: de }),
          dateLabel: format(d, "d. MMMM yyyy", { locale: de }),
          isWeekend: isWeekend(d),
          items: byDate.get(dateKey) ?? [],
        };
      })
      .filter(
        (day) =>
          !fromTodayOnly || !viewingCurrentMonth || day.dateKey >= todayKey,
      );
  }, [
    occurrences,
    monthKey,
    categoryFilterActive,
    selectedSet,
    fromTodayOnly,
    viewingCurrentMonth,
    todayKey,
  ]);

  const previewDates = useMemo(() => {
    if (form.dateMode === "pending") {
      if (!form.occurrenceDate) return [];
      const d = parseDateKey(form.occurrenceDate);
      return d ? [d] : [];
    }
    return listOccurrencesInYear(fieldsFromForm(form), year).slice(0, 8);
  }, [form, year]);

  const dateModes = allowedDateModes(form.frequency);
  const filterParam = categoryFilterActive ? selectedCategoryIds : null;

  function openCreate(dateKey?: string) {
    setError(null);
    setForm(emptyForm(year, dateKey));
    setEventMode("edit");
    setPanel("event");
  }

  function openView(eventId: string) {
    const event = eventById.get(eventId);
    if (!event) return;
    setError(null);
    setForm(formFromEvent(event, year));
    setEventMode("view");
    setPanel("event");
  }

  function openEdit(eventId: string) {
    const event = eventById.get(eventId);
    if (!event) return;
    setError(null);
    setForm(formFromEvent(event, year));
    setEventMode("edit");
    setPanel("event");
  }

  function closePanel() {
    setPanel(null);
    setError(null);
    setEditingCategoryId(null);
    setNewCategoryName("");
    setNewCategoryColor("#d4edc0");
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
      closePanel();
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
      closePanel();
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
      closePanel();
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

  function startEditCategory(cat: CalendarCategoryOption) {
    setError(null);
    setEditingCategoryId(cat.id);
    setNewCategoryName(cat.name);
    setNewCategoryColor(cat.color);
  }

  function resetCategoryForm() {
    setEditingCategoryId(null);
    setNewCategoryName("");
    setNewCategoryColor("#d4edc0");
  }

  function saveCategory() {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("name", newCategoryName);
      fd.set("color", newCategoryColor);
      if (editingCategoryId) {
        fd.set("id", editingCategoryId);
        fd.set("active", "true");
        const result = await updateEditorialCalendarCategory(fd);
        if ("error" in result && result.error) {
          setError(result.error);
          return;
        }
      } else {
        const result = await createEditorialCalendarCategory(fd);
        if ("error" in result && result.error) {
          setError(result.error);
          return;
        }
      }
      resetCategoryForm();
      router.refresh();
    });
  }

  function deleteCategory(id: string, name: string) {
    if (
      !window.confirm(
        `Kategorie «${name}» wirklich löschen? Events behalten danach keine Kategorie.`,
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", id);
      const result = await deleteEditorialCalendarCategory(fd);
      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }
      if (editingCategoryId === id) resetCategoryForm();
      setSelectedCategoryIds((prev) => prev.filter((x) => x !== id));
      router.refresh();
    });
  }

  function toggleCategory(id: string) {
    setSelectedCategoryIds((prev) => {
      const has = prev.includes(id);
      const next = has ? prev.filter((x) => x !== id) : [...prev, id];
      return next.length === 0 ? activeCategories.map((c) => c.id) : next;
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Link
            href={monthHref(prevMonth, filterParam)}
            className="btn btn-ghost px-2 py-1 text-sm"
          >
            ←
          </Link>
          <div className="min-w-[9rem] text-center">
            <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold capitalize">
              {monthLabel}
            </h2>
            <p className="text-[10px] text-[var(--muted)]">
              {filteredDays.reduce((n, d) => n + d.items.length, 0)} Termine
              {categoryFilterActive ||
              (fromTodayOnly && viewingCurrentMonth)
                ? " · gefiltert"
                : ""}
            </p>
          </div>
          <Link
            href={monthHref(nextMonth, filterParam)}
            className="btn btn-ghost px-2 py-1 text-sm"
          >
            →
          </Link>
          {monthKey !== currentMonth && (
            <Link
              href={monthHref(currentMonth, filterParam)}
              className="ml-1 rounded-lg border border-black/10 bg-white px-2.5 py-1 text-xs font-medium hover:bg-black/5"
            >
              Heute
            </Link>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {viewingCurrentMonth ? (
            <label className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
              <input
                type="checkbox"
                checked={fromTodayOnly}
                onChange={(e) => setFromTodayOnly(e.target.checked)}
              />
              Ab heute
            </label>
          ) : null}
          {categoryFilterActive ? (
            <button
              type="button"
              className="text-xs font-medium text-[var(--accent)] underline-offset-2 hover:underline"
              onClick={() =>
                setSelectedCategoryIds(activeCategories.map((c) => c.id))
              }
            >
              Alle anzeigen
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setError(null);
              resetCategoryForm();
              setPanel("category");
            }}
            className="btn btn-ghost px-3 py-1.5 text-sm"
          >
            Kategorien
          </button>
          <button
            type="button"
            onClick={() => openCreate(todayKey)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--highlight)] px-3 py-1.5 text-sm font-bold text-[#0a0a0a]"
          >
            <Plus className="size-4" />
            Event
          </button>
        </div>
      </div>

      {activeCategories.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {activeCategories.map((cat) => {
            const active = selectedSet.has(cat.id);
            return (
              <button
                key={cat.id}
                type="button"
                aria-pressed={active}
                className={
                  active
                    ? "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs"
                    : "inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-2 py-0.5 text-xs text-[var(--muted)]"
                }
                style={
                  active
                    ? {
                        borderColor: cat.color,
                        background: `${cat.color}22`,
                      }
                    : undefined
                }
                onClick={() => toggleCategory(cat.id)}
              >
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: cat.color }}
                  aria-hidden
                />
                {cat.name}
              </button>
            );
          })}
        </div>
      )}

      {pending.length > 0 && (
        <section className="overflow-hidden rounded-lg border border-amber-200 bg-amber-50/50">
          <header className="px-3 py-1.5 text-xs font-semibold tracking-wide text-amber-900">
            Noch einzuplanen ({year}) · {pending.length}
          </header>
          <ul className="divide-y divide-amber-200/80">
            {pending.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{
                        background: p.category?.color ?? DEFAULT_COLOR,
                      }}
                    />
                    <span className="truncate text-sm font-semibold">
                      {p.title}
                    </span>
                    <span className="text-[10px] text-[var(--muted)]">
                      {FREQUENCY_LABELS[p.frequency]} · Datum offen
                    </span>
                  </div>
                  {p.note && (
                    <p className="mt-1 text-sm leading-snug text-[var(--muted)]">
                      <LinkifiedText text={p.note} />
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => openView(p.id)}
                    className="rounded-lg px-2 py-1 text-xs font-medium text-[var(--muted)] hover:bg-black/5"
                  >
                    Anzeigen
                  </button>
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

      <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]">
        {filteredDays.map((day, dayIndex) => (
          <section
            key={day.dateKey}
            className={[
              dayIndex > 0 ? "border-t border-[var(--border)]" : "",
              day.isWeekend ? "bg-[var(--bg)]/70" : "",
            ]
              .filter(Boolean)
              .join(" ") || undefined}
          >
            <header
              className={[
                "flex items-center justify-between gap-2 px-3 py-1",
                day.isWeekend
                  ? "bg-black/[0.06]"
                  : "bg-black/[0.03]",
              ].join(" ")}
            >
              <p
                className={[
                  "text-xs font-semibold tracking-wide",
                  day.isWeekend
                    ? "text-[var(--fg)]"
                    : "text-[var(--muted)]",
                ].join(" ")}
              >
                {day.weekdayLabel} · {day.dateLabel}
              </p>
              <button
                type="button"
                onClick={() => openCreate(day.dateKey)}
                className="text-[10px] font-medium text-[var(--muted)] hover:text-[var(--fg)]"
              >
                + Event
              </button>
            </header>
            <ul className="divide-y divide-[var(--border)]">
              {day.items.length === 0 ? (
                <li>
                  <button
                    type="button"
                    onClick={() => openCreate(day.dateKey)}
                    className="w-full px-3 py-2 text-left text-xs text-[var(--muted)] hover:bg-black/[0.02]"
                  >
                    — kein Event —
                  </button>
                </li>
              ) : (
                day.items.map((item) => {
                  const color = item.category?.color ?? DEFAULT_COLOR;
                  return (
                    <li key={`${item.eventId}-${item.dateKey}`}>
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => openView(item.eventId)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            openView(item.eventId);
                          }
                        }}
                        className="flex w-full cursor-pointer flex-wrap items-start gap-x-3 gap-y-1 border-l-[3px] px-3 py-2 text-left hover:bg-black/[0.02]"
                        style={{
                          borderLeftColor: color,
                          background: `${color}14`,
                        }}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold leading-tight">
                            <span
                              className="mr-1.5 inline-block size-2 rounded-full align-middle"
                              style={{ background: color }}
                              aria-hidden
                            />
                            {item.title}
                          </p>
                          {item.note ? (
                            <p className="mt-1 text-sm leading-snug text-[var(--fg)]/80">
                              <LinkifiedText text={item.note} />
                            </p>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-0.5 text-right">
                          {item.category ? (
                            <span className="text-[10px] font-medium text-[var(--muted)]">
                              {item.category.name}
                            </span>
                          ) : null}
                          <span className="text-[10px] text-[var(--muted)]">
                            {scheduleSummary(item.frequency, item.dateMode)}
                          </span>
                        </div>
                      </div>
                    </li>
                  );
                })
              )}
            </ul>
          </section>
        ))}
        {filteredDays.length === 0 && (
          <p className="px-3 py-4 text-sm text-[var(--muted)]">
            Keine Tage in diesem Zeitraum.
            {fromTodayOnly && viewingCurrentMonth
              ? " Oder «Ab heute» ausschalten."
              : ""}
          </p>
        )}
      </div>

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
                  ? editingCategoryId
                    ? "Kategorie bearbeiten"
                    : "Kategorien"
                  : panel === "pending"
                    ? "Datum setzen"
                    : eventMode === "view"
                      ? "Event"
                      : form.id
                        ? "Event bearbeiten"
                        : "Neues Event"}
              </h3>
              <button
                type="button"
                onClick={closePanel}
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

            {panel === "category" && (
              <div className="space-y-3">
                <div>
                  <label className={labelClass} htmlFor="cat-name">
                    {editingCategoryId ? "Name ändern" : "Neue Kategorie"}
                  </label>
                  <input
                    id="cat-name"
                    className={inputClass}
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="Name"
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
                <div className="flex justify-end gap-2">
                  {editingCategoryId ? (
                    <button
                      type="button"
                      onClick={resetCategoryForm}
                      className="rounded-lg px-3 py-2 text-sm text-[var(--muted)] hover:bg-black/5"
                    >
                      Abbrechen
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={pendingTx || !newCategoryName.trim()}
                    onClick={saveCategory}
                    className="rounded-xl bg-[var(--highlight)] px-4 py-2 text-sm font-bold text-[#0a0a0a] disabled:opacity-50"
                  >
                    {editingCategoryId ? "Aktualisieren" : "Anlegen"}
                  </button>
                </div>
                {categories.length > 0 && (
                  <ul className="space-y-1 border-t border-black/10 pt-3">
                    {categories.map((c) => (
                      <li
                        key={c.id}
                        className={[
                          "flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm",
                          editingCategoryId === c.id ? "bg-black/[0.04]" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        <span
                          className="size-3 shrink-0 rounded-full"
                          style={{ background: c.color }}
                        />
                        <span
                          className={[
                            "min-w-0 flex-1 truncate",
                            c.active ? "" : "opacity-50",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                        >
                          {c.name}
                          {!c.active ? " (inaktiv)" : ""}
                        </span>
                        <button
                          type="button"
                          onClick={() => startEditCategory(c)}
                          className="rounded-lg p-1.5 text-[var(--muted)] hover:bg-black/5 hover:text-[var(--fg)]"
                          aria-label={`${c.name} bearbeiten`}
                          title="Bearbeiten"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={pendingTx}
                          onClick={() => deleteCategory(c.id, c.name)}
                          className="rounded-lg p-1.5 text-[var(--muted)] hover:bg-red-50 hover:text-red-700"
                          aria-label={`${c.name} löschen`}
                          title="Löschen"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
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

            {panel === "event" && eventMode === "view" && (
              <div className="space-y-4">
                {(() => {
                  const viewCategory =
                    categories.find((c) => c.id === form.categoryId) ?? null;
                  const color = viewCategory?.color ?? DEFAULT_COLOR;
                  return (
                    <>
                      <div className="flex items-start gap-3">
                        <span
                          className="mt-1.5 size-3 shrink-0 rounded-full"
                          style={{ background: color }}
                          aria-hidden
                        />
                        <div className="min-w-0 flex-1">
                          <p className="font-[family-name:var(--font-display)] text-xl font-semibold leading-snug">
                            {form.title || "Ohne Titel"}
                          </p>
                          <p className="mt-1 text-sm text-[var(--muted)]">
                            {scheduleSummary(form.frequency, form.dateMode)}
                            {viewCategory ? ` · ${viewCategory.name}` : ""}
                          </p>
                        </div>
                      </div>

                      {previewDates.length > 0 ? (
                        <div>
                          <p className={labelClass}>Termine {year}</p>
                          <p className="text-sm">
                            {previewDates
                              .map((d) =>
                                d.toLocaleDateString("de-CH", {
                                  weekday: "short",
                                  day: "numeric",
                                  month: "long",
                                }),
                              )
                              .join(", ")}
                            {form.dateMode !== "pending" &&
                              listOccurrencesInYear(fieldsFromForm(form), year)
                                .length > 8 &&
                              " …"}
                          </p>
                        </div>
                      ) : form.dateMode === "pending" ? (
                        <p className="text-sm text-amber-800">
                          Datum für {year} noch offen.
                        </p>
                      ) : null}

                      {form.note.trim() ? (
                        <div>
                          <p className={labelClass}>Notiz</p>
                          <p className="whitespace-pre-wrap text-base leading-relaxed text-[var(--fg)]">
                            <LinkifiedText text={form.note} />
                          </p>
                        </div>
                      ) : null}

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <button
                          type="button"
                          disabled={pendingTx}
                          onClick={archiveEvent}
                          className="rounded-lg px-3 py-2 text-sm text-red-700 hover:bg-red-50"
                        >
                          Archivieren
                        </button>
                        <button
                          type="button"
                          onClick={() => setEventMode("edit")}
                          className="rounded-xl bg-[var(--highlight)] px-4 py-2 text-sm font-bold text-[#0a0a0a]"
                        >
                          Bearbeiten
                        </button>
                      </div>
                    </>
                  );
                })()}
              </div>
            )}

            {panel === "event" && eventMode === "edit" && (
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
                      Das Event bleibt jährlich ohne fixes Datum. Optional
                      kannst du für {year} gleich ein erstes Datum setzen —
                      sonst landet es unter «Noch einzuplanen».
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
                    {form.dateMode !== "pending" &&
                      listOccurrencesInYear(fieldsFromForm(form), year)
                        .length > 8 &&
                      " …"}
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
                  <div className="flex gap-2">
                    {form.id ? (
                      <button
                        type="button"
                        onClick={() => {
                          const event = eventById.get(form.id!);
                          if (event) setForm(formFromEvent(event, year));
                          setError(null);
                          setEventMode("view");
                        }}
                        className="rounded-lg px-3 py-2 text-sm text-[var(--muted)] hover:bg-black/5"
                      >
                        Abbrechen
                      </button>
                    ) : null}
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
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
