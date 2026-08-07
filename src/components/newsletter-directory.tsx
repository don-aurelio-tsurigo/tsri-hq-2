"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type KeyboardEvent,
} from "react";
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
  /** Currently viewed month `yyyy-MM` */
  monthKey: string;
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

function isValidCampaignUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  try {
    // Match server Zod `.url()` expectation for absolute URLs
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function isValidWordleWord(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  return /^[A-ZÄÖÜ]{5}$/.test(trimmed.toLocaleUpperCase("de-CH"));
}

function normalizeWordleForCompare(value: string): string {
  return value.trim().toLocaleUpperCase("de-CH");
}

function MoreMenu({
  pending,
  skipped,
  holidayName,
  hasCampaign,
  onSkip,
  onSkipHoliday,
  onClear,
}: {
  pending: boolean;
  skipped: boolean;
  holidayName: string | null;
  hasCampaign: boolean;
  onSkip: () => void;
  onSkipHoliday: () => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: Event) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        className="inline-flex size-8 items-center justify-center rounded-lg text-[var(--muted)] hover:bg-black/5 hover:text-[var(--fg)]"
        aria-label="Weitere Aktionen"
        aria-expanded={open}
        disabled={pending}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <span aria-hidden className="text-lg leading-none">
          ···
        </span>
      </button>
      {open && (
        <div
          className="absolute right-0 z-20 mt-1 min-w-[11rem] rounded-xl border border-[var(--border)] bg-white py-1 shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          {!skipped && (
            <button
              type="button"
              className="block w-full px-3 py-2 text-left text-sm hover:bg-black/5"
              disabled={pending}
              onClick={() => {
                setOpen(false);
                onSkip();
              }}
            >
              Ausfallen lassen
            </button>
          )}
          {!skipped && holidayName && (
            <button
              type="button"
              className="block w-full px-3 py-2 text-left text-sm hover:bg-black/5"
              disabled={pending}
              onClick={() => {
                setOpen(false);
                onSkipHoliday();
              }}
            >
              Feiertag ({holidayName})
            </button>
          )}
          {hasCampaign && (
            <button
              type="button"
              className="block w-full px-3 py-2 text-left text-sm hover:bg-black/5"
              disabled={pending}
              onClick={() => {
                setOpen(false);
                onClear();
              }}
            >
              {skipped ? "Wieder öffnen" : "Vorbereitung löschen"}
            </button>
          )}
          {skipped && !hasCampaign && (
            <p className="px-3 py-2 text-xs text-[var(--muted)]">
              Keine weiteren Aktionen
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function SlotCard({
  slot,
  members,
}: {
  slot: NewsletterCalendarSlot;
  members: Member[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [authorId, setAuthorId] = useState(slot.campaign?.authorId ?? "");
  const [url, setUrl] = useState(slot.campaign?.campaignUrl ?? "");
  const [note, setNote] = useState(slot.campaign?.note ?? "");
  const [wordleWord, setWordleWord] = useState(
    slot.campaign?.wordleWord ?? "",
  );
  const [noteOpen, setNoteOpen] = useState(
    () => !!(slot.campaign?.note?.trim()),
  );
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [pending, startTransition] = useTransition();
  const saveGen = useRef(0);

  const skipped = slot.campaign?.status === "skipped";
  const prepared =
    !!slot.campaign &&
    slot.campaign.status !== "skipped" &&
    (!!slot.campaign.authorId || !!slot.campaign.campaignUrl);
  /** Open slots always show fields; prepared only while editing. */
  const showFields = !skipped && (!prepared || editing);

  function isComplete(values: {
    authorId: string;
    url: string;
    wordleWord: string;
  }) {
    if (!values.authorId) return false;
    if (!values.url.trim() || !isValidCampaignUrl(values.url)) return false;
    if (slot.requiresWordle) {
      if (!values.wordleWord.trim() || !isValidWordleWord(values.wordleWord)) {
        return false;
      }
    }
    return true;
  }

  const complete = skipped
    ? false
    : showFields
      ? isComplete({ authorId, url, wordleWord })
      : isComplete({
          authorId: slot.campaign?.authorId ?? "",
          url: slot.campaign?.campaignUrl ?? "",
          wordleWord: slot.campaign?.wordleWord ?? "",
        });

  useEffect(() => {
    setAuthorId(slot.campaign?.authorId ?? "");
    setUrl(slot.campaign?.campaignUrl ?? "");
    setNote(slot.campaign?.note ?? "");
    setWordleWord(slot.campaign?.wordleWord ?? "");
    setNoteOpen(!!(slot.campaign?.note?.trim()));
    setError(null);
    if (!prepared) setEditing(false);
  }, [slot, prepared]);

  function baseline() {
    return {
      authorId: slot.campaign?.authorId ?? "",
      url: slot.campaign?.campaignUrl ?? "",
      note: slot.campaign?.note ?? "",
      wordleWord: slot.campaign?.wordleWord ?? "",
    };
  }

  function isDirty(next = { authorId, url, note, wordleWord }) {
    const b = baseline();
    return (
      next.authorId !== b.authorId ||
      next.url.trim() !== b.url.trim() ||
      next.note.trim() !== b.note.trim() ||
      normalizeWordleForCompare(next.wordleWord) !==
        normalizeWordleForCompare(b.wordleWord)
    );
  }

  /** Format-only checks — empty fields are allowed and save as draft-ish. */
  function validateForSave(
    next = { authorId, url, note, wordleWord },
  ): string | null {
    if (next.url.trim() && !isValidCampaignUrl(next.url)) {
      return "Kampagnen-Link muss eine gültige URL sein.";
    }
    if (next.wordleWord.trim() && !isValidWordleWord(next.wordleWord)) {
      return "Wordle-Wort muss genau 5 Buchstaben sein.";
    }
    return null;
  }

  function persist(next = { authorId, url, note, wordleWord }) {
    if (skipped) return;
    if (!isDirty(next)) return;

    const validationError = validateForSave(next);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    const gen = ++saveGen.current;
    const fd = new FormData();
    fd.set("typeId", slot.typeId);
    fd.set("date", slot.dateKey);
    fd.set("authorId", next.authorId);
    fd.set("campaignUrl", next.url.trim());
    fd.set("note", next.note);
    fd.set("wordleWord", slot.requiresWordle ? next.wordleWord : "");

    startTransition(async () => {
      const result = await upsertNewsletterSlot(fd);
      if (gen !== saveGen.current) return;
      if (result?.error) {
        setError(result.error);
        return;
      }
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 1200);
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
      setEditing(false);
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
      setAuthorId("");
      setUrl("");
      setNote("");
      setWordleWord("");
      setNoteOpen(false);
      setEditing(false);
      router.refresh();
    });
  }

  function beginEditPrepared() {
    setAuthorId(slot.campaign?.authorId ?? "");
    setUrl(slot.campaign?.campaignUrl ?? "");
    setNote(slot.campaign?.note ?? "");
    setWordleWord(slot.campaign?.wordleWord ?? "");
    setNoteOpen(!!(slot.campaign?.note?.trim()));
    setError(null);
    setEditing(true);
  }

  function cancelEditPrepared() {
    setAuthorId(slot.campaign?.authorId ?? "");
    setUrl(slot.campaign?.campaignUrl ?? "");
    setNote(slot.campaign?.note ?? "");
    setWordleWord(slot.campaign?.wordleWord ?? "");
    setError(null);
    setEditing(false);
  }

  function onFieldKeyDown(e: KeyboardEvent<HTMLInputElement | HTMLSelectElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      (e.target as HTMLElement).blur();
    }
    if (e.key === "Escape" && prepared && editing) {
      e.preventDefault();
      cancelEditPrepared();
    }
  }

  const fields = (
    <div className="mt-2 space-y-1.5">
      <div
        className={[
          "grid gap-1.5",
          slot.requiresWordle
            ? "sm:grid-cols-[minmax(6.5rem,8rem)_minmax(0,1fr)_5.5rem]"
            : "sm:grid-cols-[minmax(6.5rem,8rem)_minmax(0,1fr)]",
        ].join(" ")}
      >
        <label className="min-w-0 text-[0.65rem] font-semibold tracking-wide text-[var(--muted)] uppercase">
          Autor:in
          <select
            className="mt-0.5 w-full rounded-lg border border-[var(--border)] bg-white px-2 py-1.5 text-sm font-medium text-[var(--fg)]"
            value={authorId}
            disabled={pending}
            onChange={(e) => {
              const nextAuthor = e.target.value;
              setAuthorId(nextAuthor);
              persist({
                authorId: nextAuthor,
                url,
                note,
                wordleWord,
              });
            }}
            onKeyDown={onFieldKeyDown}
          >
            <option value="">—</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-0 text-[0.65rem] font-semibold tracking-wide text-[var(--muted)] uppercase">
          Kampagnen-Link
          <input
            className="mt-0.5 w-full rounded-lg border border-[var(--border)] bg-white px-2 py-1.5 text-sm font-medium text-[var(--fg)]"
            type="url"
            value={url}
            disabled={pending}
            onChange={(e) => setUrl(e.target.value)}
            onBlur={() => persist()}
            onKeyDown={onFieldKeyDown}
            placeholder="https://…"
          />
        </label>
        {slot.requiresWordle && (
          <label className="min-w-0 text-[0.65rem] font-semibold tracking-wide text-[var(--muted)] uppercase">
            Wordle
            <input
              className="mt-0.5 w-full rounded-lg border border-[var(--border)] bg-white px-2 py-1.5 text-sm font-medium tracking-wide text-[var(--fg)]"
              type="text"
              value={wordleWord}
              disabled={pending}
              onChange={(e) => setWordleWord(e.target.value)}
              onBlur={() => persist()}
              onKeyDown={onFieldKeyDown}
              placeholder="5 Buchstaben"
              maxLength={5}
              autoCapitalize="characters"
              spellCheck={false}
            />
          </label>
        )}
      </div>
      {noteOpen ? (
        <label className="block text-[0.65rem] font-semibold tracking-wide text-[var(--muted)] uppercase">
          Notiz
          <input
            className="mt-0.5 w-full rounded-lg border border-[var(--border)] bg-white px-2 py-1.5 text-sm font-medium text-[var(--fg)]"
            type="text"
            value={note}
            disabled={pending}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => persist()}
            onKeyDown={onFieldKeyDown}
            placeholder={
              slot.holidayName ? `z.B. ${slot.holidayName}` : "Optional"
            }
          />
        </label>
      ) : (
        <button
          type="button"
          className="text-xs font-semibold text-[var(--muted)] hover:text-[var(--fg)]"
          onClick={() => setNoteOpen(true)}
        >
          + Notiz
        </button>
      )}
      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
    </div>
  );

  return (
    <div
      className={[
        "rounded-xl border px-3 py-2 transition-colors",
        savedFlash
          ? "border-[var(--accent)] bg-[var(--accent-soft)]/50 ring-1 ring-[var(--accent)]/40"
          : skipped
            ? "border-dashed border-[var(--border)] bg-[var(--bg)]/50 opacity-80"
            : complete
              ? "border-emerald-500/50 bg-emerald-50/80"
              : prepared
                ? "border-[color-mix(in_oklab,var(--highlight)_65%,var(--border))] bg-[var(--highlight)]/55"
                : "border-[var(--accent)]/40 bg-[var(--accent-soft)]/40",
      ].join(" ")}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p
              className={[
                "font-semibold",
                skipped ? "line-through text-[var(--muted)]" : "",
              ].join(" ")}
            >
              {slot.typeName}
            </p>
            {prepared && !complete && !skipped && (
              <span className="text-xs font-semibold text-[var(--fg)]/70">
                Unvollständig
              </span>
            )}
            {savedFlash && (
              <span className="text-xs font-semibold text-[var(--accent-hover)]">
                Gespeichert
              </span>
            )}
            {pending && !savedFlash && (
              <span className="text-xs text-[var(--muted)]">…</span>
            )}
          </div>
          {skipped && (
            <p className="text-sm text-[var(--muted)]">
              Fällt aus
              {slot.campaign?.note ? ` · ${slot.campaign.note}` : ""}
            </p>
          )}
          {prepared && !editing && (
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
              {slot.campaign?.wordleWord ? (
                <>
                  {" · "}
                  <span className="font-semibold tracking-wide">
                    Wordle {slot.campaign.wordleWord}
                  </span>
                </>
              ) : null}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1">
          {prepared &&
            (editing ? (
              <button
                type="button"
                className="btn btn-ghost !px-2 !py-1 text-xs"
                onClick={cancelEditPrepared}
              >
                Schliessen
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-secondary !px-2 !py-1 text-xs"
                onClick={beginEditPrepared}
              >
                Bearbeiten
              </button>
            ))}
          <MoreMenu
            pending={pending}
            skipped={skipped}
            holidayName={slot.holidayName}
            hasCampaign={!!slot.campaign}
            onSkip={() => skip(false)}
            onSkipHoliday={() => skip(true)}
            onClear={clear}
          />
        </div>
      </div>

      {showFields && fields}
      {skipped && (
        <p className="mt-1 text-xs text-[var(--muted)]">
          Über «···» wieder öffnen.
        </p>
      )}
    </div>
  );
}

export function NewsletterDirectory({
  types,
  initialTypeIds,
  members,
  calendar,
}: {
  types: NewsletterTypeOption[];
  /** Empty = alle Typen anzeigen */
  initialTypeIds: string[];
  members: Member[];
  calendar: CalendarMonth;
}) {
  const router = useRouter();
  const today = todayDateKey();
  const allTypeIds = useMemo(() => types.map((t) => t.id), [types]);
  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    initialTypeIds.length > 0 ? initialTypeIds : allTypeIds,
  );
  const [fromTodayOnly, setFromTodayOnly] = useState(true);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const filterActive =
    selectedIds.length > 0 && selectedIds.length < types.length;

  const filteredDays = useMemo(() => {
    const viewingCurrent = calendar.monthKey === calendar.currentMonth;
    return calendar.days
      .map((day) => ({
        ...day,
        slots: day.slots.filter((s) => selectedSet.has(s.typeId)),
      }))
      .filter((day) => day.slots.length > 0)
      .filter(
        (day) =>
          !fromTodayOnly || !viewingCurrent || day.dateKey >= today,
      );
  }, [
    calendar.days,
    calendar.monthKey,
    calendar.currentMonth,
    selectedSet,
    fromTodayOnly,
    today,
  ]);

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
  const viewingCurrentMonth = calendar.monthKey === calendar.currentMonth;

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
                {openCount} noch offen
                {filterActive || (fromTodayOnly && viewingCurrentMonth)
                  ? " (gefiltert)"
                  : " in diesem Monat"}
              </p>
            </div>
            <Link
              href={monthHref(calendar.nextMonth, typeFilterParam)}
              className="btn btn-ghost"
            >
              →
            </Link>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {viewingCurrentMonth ? (
              <button
                type="button"
                aria-pressed={fromTodayOnly}
                title={
                  fromTodayOnly
                    ? "Nur Ausgaben ab heute — klicken für alle im Monat"
                    : "Alle Ausgaben im Monat — klicken für nur ab heute"
                }
                className={[
                  "rounded-full border px-3 py-1.5 text-sm font-semibold transition",
                  fromTodayOnly
                    ? "border-[var(--fg)] bg-[var(--fg)] text-white"
                    : "border-[var(--border)] bg-white text-[var(--muted)] hover:border-[var(--fg)] hover:text-[var(--fg)]",
                ].join(" ")}
                onClick={() => setFromTodayOnly((v) => !v)}
              >
                Ab heute
              </button>
            ) : (
              <Link
                href={monthHref(calendar.currentMonth, typeFilterParam)}
                className="text-sm font-semibold text-[var(--accent)] hover:underline"
                onClick={() => setFromTodayOnly(true)}
              >
                Ab heute
              </Link>
            )}
            <Link
              href={monthHref(calendar.currentMonth, typeFilterParam)}
              className="text-sm font-semibold text-[var(--accent)] hover:underline"
            >
              Dieser Monat
            </Link>
          </div>
        </div>

        {calendar.days.length === 0 ? (
          <div className="card px-4 py-8 text-sm text-[var(--muted)]">
            Keine Erscheinungstage in diesem Monat. Admins legen die Typen und
            Wochentage unter Newslettereinstellungen fest.
          </div>
        ) : filteredDays.length === 0 ? (
          <div className="card px-4 py-8 text-sm text-[var(--muted)]">
            {selectedIds.length === 0 ? (
              <>
                Kein Newsletter-Typ ausgewählt.{" "}
                <button
                  type="button"
                  className="font-semibold text-[var(--accent)] hover:underline"
                  onClick={showAll}
                >
                  Alle anzeigen
                </button>
              </>
            ) : fromTodayOnly ? (
              <>
                Keine Ausgaben ab heute in diesem Monat.{" "}
                <button
                  type="button"
                  className="font-semibold text-[var(--accent)] hover:underline"
                  onClick={() => setFromTodayOnly(false)}
                >
                  Vergangene einblenden
                </button>
              </>
            ) : (
              <>
                Keine Slots für die gewählten Filter.{" "}
                <button
                  type="button"
                  className="font-semibold text-[var(--accent)] hover:underline"
                  onClick={showAll}
                >
                  Alle anzeigen
                </button>
              </>
            )}
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
                  <div className="grid gap-2 xl:grid-cols-2">
                    {day.slots.map((slot) => (
                      <SlotCard
                        key={`${slot.typeId}-${slot.dateKey}`}
                        slot={slot}
                        members={members}
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
