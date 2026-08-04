"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  clearNewsletterSlot,
  skipNewsletterSlot,
  upsertNewsletterSlot,
} from "@/lib/actions";
import { todayDateKey } from "@/lib/newsletter-constants";
import type {
  NewsletterCalendarDay,
  NewsletterCalendarSlot,
} from "@/lib/newsletter";

type Member = { id: string; name: string };
type NewsletterTypeOption = { id: string; name: string };

type CalendarMonth = {
  monthLabel: string;
  prevMonth: string;
  nextMonth: string;
  currentMonth: string;
  days: NewsletterCalendarDay[];
};

function formatDayLabel(dateKey: string) {
  const [y, m, d] = dateKey.split("-").map(Number);
  return `${d}.${m}.${y}`;
}

function monthHref(month: string, selectedTypeIds: string[] | null) {
  const params = new URLSearchParams();
  params.set("month", month);
  if (selectedTypeIds && selectedTypeIds.length > 0) {
    for (const id of selectedTypeIds) params.append("type", id);
  }
  return `/newsletter?${params.toString()}`;
}

function SlotCard({
  slot,
  members,
  currentUserId,
}: {
  slot: NewsletterCalendarSlot;
  members: Member[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [authorId, setAuthorId] = useState(
    slot.campaign?.authorId ?? currentUserId,
  );
  const [url, setUrl] = useState(slot.campaign?.campaignUrl ?? "");
  const [note, setNote] = useState(slot.campaign?.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const skipped = slot.campaign?.status === "skipped";
  const booked =
    !!slot.campaign &&
    slot.campaign.status !== "skipped" &&
    (!!slot.campaign.authorId || !!slot.campaign.campaignUrl);

  function save() {
    setError(null);
    const fd = new FormData();
    fd.set("typeId", slot.typeId);
    fd.set("date", slot.dateKey);
    fd.set("authorId", authorId);
    fd.set("campaignUrl", url);
    fd.set("note", note);
    startTransition(async () => {
      const result = await upsertNewsletterSlot(fd);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  function skip(withHolidayNote: boolean) {
    setError(null);
    const fd = new FormData();
    fd.set("typeId", slot.typeId);
    fd.set("date", slot.dateKey);
    fd.set(
      "note",
      withHolidayNote && slot.holidayName
        ? slot.holidayName
        : note || slot.campaign?.note || "",
    );
    startTransition(async () => {
      const result = await skipNewsletterSlot(fd);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  function clear() {
    setError(null);
    const fd = new FormData();
    if (slot.campaign?.id) fd.set("id", slot.campaign.id);
    fd.set("typeId", slot.typeId);
    fd.set("date", slot.dateKey);
    startTransition(async () => {
      const result = await clearNewsletterSlot(fd);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setAuthorId(currentUserId);
      setUrl("");
      setNote("");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div
      className={[
        "rounded-xl border px-3 py-2",
        skipped
          ? "border-dashed border-[var(--border)] bg-[var(--bg)]/50 opacity-80"
          : booked
            ? "border-[var(--border)] bg-white"
            : "border-[var(--accent)]/40 bg-[var(--accent-soft)]/40",
      ].join(" ")}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p
            className={[
              "font-semibold",
              skipped ? "line-through text-[var(--muted)]" : "",
            ].join(" ")}
          >
            {slot.typeName}
          </p>
          {skipped ? (
            <p className="text-sm text-[var(--muted)]">
              Fällt aus
              {slot.campaign?.note ? ` · ${slot.campaign.note}` : ""}
            </p>
          ) : booked ? (
            <p className="text-sm text-[var(--muted)]">
              {slot.campaign?.authorName ?? "Ohne Autor"}
              {slot.campaign?.campaignUrl ? (
                <>
                  {" · "}
                  <a
                    href={slot.campaign.campaignUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-[var(--accent-hover)] underline underline-offset-2"
                  >
                    Link
                  </a>
                </>
              ) : null}
            </p>
          ) : (
            <p className="text-sm font-medium text-[var(--accent-hover)]">
              Offen — noch buchen
            </p>
          )}
        </div>
        <button
          type="button"
          className="btn btn-secondary !px-2 !py-1 text-xs"
          onClick={() => {
            setAuthorId(slot.campaign?.authorId ?? currentUserId);
            setUrl(slot.campaign?.campaignUrl ?? "");
            setNote(slot.campaign?.note ?? "");
            setOpen((v) => !v);
          }}
        >
          {open ? "Schliessen" : skipped ? "Ändern" : booked ? "Bearbeiten" : "Buchen"}
        </button>
      </div>

      {open && (
        <div className="mt-3 space-y-2 border-t border-[var(--border)] pt-3">
          {!skipped && (
            <>
              <label className="field text-xs font-semibold text-[var(--muted)]">
                Autor:in
                <select
                  value={authorId}
                  onChange={(e) => setAuthorId(e.target.value)}
                >
                  <option value="">—</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field text-xs font-semibold text-[var(--muted)]">
                Kampagnen-Link
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://…"
                />
              </label>
            </>
          )}
          <label className="field text-xs font-semibold text-[var(--muted)]">
            Notiz
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                slot.holidayName
                  ? `z.B. ${slot.holidayName}`
                  : "z.B. Sommerpause"
              }
            />
          </label>
          {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
          <div className="flex flex-wrap gap-2">
            {!skipped && (
              <button
                type="button"
                className="btn btn-primary text-sm"
                disabled={pending}
                onClick={save}
              >
                {pending ? "…" : "Speichern"}
              </button>
            )}
            {!skipped && (
              <button
                type="button"
                className="btn btn-secondary text-sm"
                disabled={pending}
                onClick={() => skip(false)}
              >
                Ausfallen lassen
              </button>
            )}
            {slot.holidayName && !skipped && (
              <button
                type="button"
                className="btn btn-secondary text-sm"
                disabled={pending}
                onClick={() => skip(true)}
              >
                Feiertag ({slot.holidayName})
              </button>
            )}
            {slot.campaign && (
              <button
                type="button"
                className="btn btn-secondary text-sm"
                disabled={pending}
                onClick={clear}
              >
                {skipped ? "Wieder öffnen" : "Slot leeren"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function NewsletterDirectory({
  types,
  initialTypeIds,
  members,
  currentUserId,
  calendar,
}: {
  types: NewsletterTypeOption[];
  /** Empty = alle Typen anzeigen */
  initialTypeIds: string[];
  members: Member[];
  currentUserId: string;
  calendar: CalendarMonth;
}) {
  const router = useRouter();
  const today = todayDateKey();
  const allTypeIds = useMemo(() => types.map((t) => t.id), [types]);
  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    initialTypeIds.length > 0 ? initialTypeIds : allTypeIds,
  );

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const filterActive =
    selectedIds.length > 0 && selectedIds.length < types.length;

  const filteredDays = useMemo(() => {
    return calendar.days
      .map((day) => ({
        ...day,
        slots: day.slots.filter((s) => selectedSet.has(s.typeId)),
      }))
      .filter((day) => day.slots.length > 0);
  }, [calendar.days, selectedSet]);

  const openCount = useMemo(
    () =>
      filteredDays.reduce(
        (n, day) =>
          n +
          day.slots.filter(
            (s) =>
              !s.campaign ||
              (s.campaign.status !== "skipped" &&
                !s.campaign.authorId &&
                !s.campaign.campaignUrl),
          ).length,
        0,
      ),
    [filteredDays],
  );

  function syncUrl(nextIds: string[]) {
    const params = new URLSearchParams(window.location.search);
    params.delete("type");
    // Clean URL when all types shown
    if (nextIds.length > 0 && nextIds.length < types.length) {
      for (const id of nextIds) params.append("type", id);
    }
    const qs = params.toString();
    router.replace(qs ? `/newsletter?${qs}` : "/newsletter", { scroll: false });
  }

  function toggleType(typeId: string) {
    setSelectedIds((prev) => {
      const has = prev.includes(typeId);
      const next = has
        ? prev.filter((id) => id !== typeId)
        : [...prev, typeId];
      syncUrl(next);
      return next;
    });
  }

  function showAll() {
    setSelectedIds(allTypeIds);
    syncUrl(allTypeIds);
  }

  const typeFilterParam = filterActive ? selectedIds : null;

  return (
    <div className="space-y-8">
      {types.length > 1 && (
        <section className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-[var(--muted)] uppercase">
              Filter
            </p>
            {filterActive && (
              <button
                type="button"
                className="text-sm font-semibold text-[var(--accent)] hover:underline"
                onClick={showAll}
              >
                Alle anzeigen
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {types.map((type) => {
              const active = selectedSet.has(type.id);
              return (
                <button
                  key={type.id}
                  type="button"
                  aria-pressed={active}
                  className={[
                    "rounded-full border px-3 py-1.5 text-sm font-semibold transition",
                    active
                      ? "border-[var(--fg)] bg-[var(--fg)] text-white"
                      : "border-[var(--border)] bg-white text-[var(--muted)] hover:border-[var(--fg)] hover:text-[var(--fg)]",
                  ].join(" ")}
                  onClick={() => toggleType(type.id)}
                >
                  {type.name}
                </button>
              );
            })}
          </div>
          {filterActive && (
            <p className="text-xs text-[var(--muted)]">
              {selectedIds.length === 1
                ? "1 Newsletter-Typ sichtbar"
                : `${selectedIds.length} Newsletter-Typen sichtbar`}
            </p>
          )}
        </section>
      )}

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Link
              href={monthHref(calendar.prevMonth, typeFilterParam)}
              className="btn btn-ghost"
            >
              ←
            </Link>
            <div>
              <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold capitalize">
                {calendar.monthLabel}
              </h2>
              <p className="text-sm text-[var(--muted)]">
                {openCount} offene Slot{openCount === 1 ? "" : "s"}
                {filterActive ? " (gefiltert)" : " in diesem Monat"}
              </p>
            </div>
            <Link
              href={monthHref(calendar.nextMonth, typeFilterParam)}
              className="btn btn-ghost"
            >
              →
            </Link>
          </div>
          <Link
            href={monthHref(calendar.currentMonth, typeFilterParam)}
            className="text-sm font-semibold text-[var(--accent)] hover:underline"
          >
            Dieser Monat
          </Link>
        </div>

        {calendar.days.length === 0 ? (
          <div className="card px-4 py-8 text-sm text-[var(--muted)]">
            Keine Erscheinungstage in diesem Monat. Admins legen die Typen und
            Wochentage unter Newsletter Einstellungen fest.
          </div>
        ) : filteredDays.length === 0 ? (
          <div className="card px-4 py-8 text-sm text-[var(--muted)]">
            {selectedIds.length === 0
              ? "Kein Newsletter-Typ ausgewählt."
              : "Keine Slots für die gewählten Filter."}{" "}
            <button
              type="button"
              className="font-semibold text-[var(--accent)] hover:underline"
              onClick={showAll}
            >
              Alle anzeigen
            </button>
          </div>
        ) : (
          <ul className="space-y-4">
            {filteredDays.map((day) => {
              const isToday = day.dateKey === today;
              return (
                <li
                  key={day.dateKey}
                  className={[
                    "card space-y-3 p-4",
                    day.holidayName ? "ring-1 ring-[var(--highlight)]" : "",
                    isToday ? "bg-[var(--accent-soft)]/30" : "",
                  ].join(" ")}
                >
                  <div className="flex flex-wrap items-baseline gap-2">
                    <p className="font-bold">
                      <span className="mr-2 text-[var(--muted)]">
                        {day.weekdayLabel}
                      </span>
                      {formatDayLabel(day.dateKey)}
                    </p>
                    {isToday && (
                      <span className="rounded-full bg-[var(--highlight)] px-2 py-0.5 text-[0.65rem] font-extrabold uppercase">
                        Heute
                      </span>
                    )}
                    {day.holidayName && (
                      <span className="rounded-full bg-[var(--highlight-soft)] px-2 py-0.5 text-xs font-bold">
                        {day.holidayName}
                      </span>
                    )}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {day.slots.map((slot) => (
                      <SlotCard
                        key={`${slot.typeId}-${slot.dateKey}`}
                        slot={slot}
                        members={members}
                        currentUserId={currentUserId}
                      />
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
