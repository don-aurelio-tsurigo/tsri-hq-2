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
import { ExternalLink } from "lucide-react";
import {
  clearNewsletterSlot,
  skipNewsletterSlot,
  upsertNewsletterSlot,
} from "@/lib/actions";
import { todayDateKey } from "@/lib/newsletter-constants";
import {
  NEWSLETTER_TYPE_COLOR_DEFAULT,
  newsletterTypeSoftBackground,
} from "@/lib/newsletter-colors";
import type {
  NewsletterCalendarDay,
  NewsletterCalendarSlot,
} from "@/lib/newsletter";

type Member = { id: string; name: string };
type NewsletterTypeOption = { id: string; name: string; color: string };

type CalendarMonth = {
  monthLabel: string;
  monthKey: string;
  prevMonth: string;
  nextMonth: string;
  currentMonth: string;
  days: NewsletterCalendarDay[];
};

function hrefFor(monthKey: string, typeId: string | null, mine: boolean) {
  const params = new URLSearchParams();
  params.set("month", monthKey);
  if (typeId) params.set("type", typeId);
  if (mine) params.set("mine", "1");
  return `/newsletter?${params.toString()}`;
}

/** «2026-08-03» → «03.08.» */
function shortDate(dateKey: string) {
  return `${dateKey.slice(8, 10)}.${dateKey.slice(5, 7)}.`;
}

/** Montag der Woche als yyyy-MM-dd (für Wochentrenner) */
function weekStartKey(dateKey: string) {
  const d = new Date(`${dateKey}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

function isValidCampaignUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  try {
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
        className="inline-flex size-7 items-center justify-center rounded text-[var(--muted)] hover:bg-black/5 hover:text-[var(--fg)]"
        aria-label="Weitere Aktionen"
        aria-expanded={open}
        disabled={pending}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <span aria-hidden className="text-base leading-none">
          ···
        </span>
      </button>
      {open && (
        <div
          className="absolute right-0 z-20 mt-1 min-w-[11rem] rounded-lg border border-[var(--border)] bg-white py-1 shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          {!skipped && (
            <button
              type="button"
              className="block w-full px-3 py-1.5 text-left text-sm hover:bg-black/5"
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
              className="block w-full px-3 py-1.5 text-left text-sm hover:bg-black/5"
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
              className="block w-full px-3 py-1.5 text-left text-sm hover:bg-black/5"
              disabled={pending}
              onClick={() => {
                setOpen(false);
                onClear();
              }}
            >
              {skipped ? "Wieder öffnen" : "Leeren"}
            </button>
          )}
          {skipped && !hasCampaign && (
            <p className="px-3 py-1.5 text-xs text-[var(--muted)]">
              Keine weiteren Aktionen
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function SlotRow({
  slot,
  members,
  dateLabel = null,
  showTypeName = true,
  rowClassName,
}: {
  slot: NewsletterCalendarSlot;
  members: Member[];
  /** Kompaktansicht: Datum direkt in der Zeile statt Tageskopf */
  dateLabel?: string | null;
  showTypeName?: boolean;
  rowClassName?: string;
}) {
  const router = useRouter();
  const [authorId, setAuthorId] = useState(slot.campaign?.authorId ?? "");
  const [url, setUrl] = useState(slot.campaign?.campaignUrl ?? "");
  const [note, setNote] = useState(slot.campaign?.note ?? "");
  const [wordleWord, setWordleWord] = useState(
    slot.campaign?.wordleWord ?? "",
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const saveGen = useRef(0);

  const skipped = slot.campaign?.status === "skipped";
  const color = slot.typeColor || NEWSLETTER_TYPE_COLOR_DEFAULT;
  const complete =
    !skipped &&
    !!authorId &&
    !!url.trim() &&
    isValidCampaignUrl(url) &&
    (!slot.requiresWordle ||
      (!!wordleWord.trim() && isValidWordleWord(wordleWord)));
  const prepared =
    !!slot.campaign &&
    slot.campaign.status !== "skipped" &&
    (!!slot.campaign.authorId || !!slot.campaign.campaignUrl);
  const incomplete = prepared && !complete && !skipped;

  useEffect(() => {
    setAuthorId(slot.campaign?.authorId ?? "");
    setUrl(slot.campaign?.campaignUrl ?? "");
    setNote(slot.campaign?.note ?? "");
    setWordleWord(slot.campaign?.wordleWord ?? "");
    setError(null);
  }, [slot]);

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
      router.refresh();
    });
  }

  function onFieldKeyDown(
    e: KeyboardEvent<HTMLInputElement | HTMLSelectElement>,
  ) {
    if (e.key === "Enter") {
      e.preventDefault();
      (e.target as HTMLElement).blur();
    }
  }

  return (
    <li
      className={[
        "border-l-[3px] px-3 py-1",
        skipped ? "opacity-55" : "",
        complete ? "bg-emerald-50/40" : "",
        rowClassName ?? "",
      ].join(" ")}
      style={{
        borderLeftColor: color,
        background: skipped
          ? undefined
          : complete
            ? undefined
            : newsletterTypeSoftBackground(color, 8),
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        {dateLabel ? (
          <span className="w-[5.5rem] shrink-0 text-sm font-semibold tabular-nums">
            {dateLabel}
          </span>
        ) : null}
        <div
          className={[
            "min-w-0 shrink-0",
            showTypeName ? "w-36 sm:w-40" : "w-24",
          ].join(" ")}
        >
          <p
            className={[
              "truncate text-sm leading-tight",
              skipped ? "line-through text-[var(--muted)]" : "",
            ].join(" ")}
          >
            {showTypeName ? (
              <>
                <span
                  className="mr-1.5 inline-block size-2 rounded-full align-middle"
                  style={{ background: color }}
                  aria-hidden
                />
                {slot.typeName}
              </>
            ) : null}
            {skipped ? (
              <span className="ml-1.5 text-[10px] no-underline text-[var(--muted)]">
                fällt aus
              </span>
            ) : null}
            {incomplete ? (
              <span className="ml-1.5 text-[10px] font-medium text-[var(--muted)]">
                unvollständig
              </span>
            ) : null}
            {slot.holidayName && !skipped ? (
              <span className="ml-1.5 text-[10px] text-[var(--muted)]">
                {slot.holidayName}
              </span>
            ) : null}
          </p>
          {error ? (
            <p className="truncate text-[10px] text-[var(--danger)]">{error}</p>
          ) : slot.campaign?.note || note ? (
            <p className="truncate text-[10px] leading-tight text-[var(--muted)]">
              {note || slot.campaign?.note}
            </p>
          ) : null}
        </div>

        <select
          className="input h-7 min-w-0 grow py-0 text-sm sm:max-w-[10rem]"
          disabled={pending || skipped}
          value={authorId}
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
          <option value="">— Offen —</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>

        <div className="flex min-w-0 grow basis-[12rem] items-center gap-1.5 sm:max-w-xs">
          <input
            className="input h-7 min-w-0 grow py-0 text-sm"
            type="url"
            disabled={pending || skipped}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onBlur={() => persist()}
            onKeyDown={onFieldKeyDown}
            placeholder="https://…"
          />
          {url.trim() && isValidCampaignUrl(url) ? (
            <a
              href={url.trim()}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center gap-0.5 text-xs font-medium text-[var(--accent-hover)] underline underline-offset-2"
              title="Kampagne öffnen"
            >
              Kampagne
              <ExternalLink className="size-3 shrink-0" aria-hidden />
            </a>
          ) : (
            <span className="w-[5.5rem] shrink-0 text-xs text-[var(--muted)]">
              —
            </span>
          )}
        </div>

        {slot.requiresWordle ? (
          <input
            className="input h-7 w-[5.5rem] shrink-0 py-0 text-center text-sm tracking-wide"
            type="text"
            disabled={pending || skipped}
            value={wordleWord}
            onChange={(e) => setWordleWord(e.target.value)}
            onBlur={() => persist()}
            onKeyDown={onFieldKeyDown}
            placeholder="Wordle"
            maxLength={5}
            autoCapitalize="characters"
            spellCheck={false}
          />
        ) : null}

        <input
          className="input h-7 w-28 shrink-0 py-0 text-sm sm:w-36"
          type="text"
          disabled={pending || skipped}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => persist()}
          onKeyDown={onFieldKeyDown}
          placeholder="Notiz"
        />

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
    </li>
  );
}

export function NewsletterDirectory({
  types,
  initialTypeId,
  initialMineOnly,
  currentUserId,
  members,
  calendar,
}: {
  types: NewsletterTypeOption[];
  /** null = alle Newsletter */
  initialTypeId: string | null;
  initialMineOnly: boolean;
  currentUserId: string;
  members: Member[];
  calendar: CalendarMonth;
}) {
  const router = useRouter();
  const today = todayDateKey();
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(
    initialTypeId,
  );
  const [mineOnly, setMineOnly] = useState(initialMineOnly);
  const [fromTodayOnly, setFromTodayOnly] = useState(true);

  // Gelöschte/deaktivierte Typen fallen auf «Alle Newsletter» zurück
  const activeTypeId =
    selectedTypeId && types.some((t) => t.id === selectedTypeId)
      ? selectedTypeId
      : null;
  const filterActive = !!activeTypeId || mineOnly;
  const viewingCurrentMonth = calendar.monthKey === calendar.currentMonth;

  const filteredDays = useMemo(() => {
    return calendar.days
      .map((day) => ({
        ...day,
        slots: day.slots.filter(
          (s) =>
            (!activeTypeId || s.typeId === activeTypeId) &&
            (!mineOnly || s.campaign?.authorId === currentUserId),
        ),
      }))
      .filter((day) => day.slots.length > 0)
      .filter(
        (day) =>
          !fromTodayOnly || !viewingCurrentMonth || day.dateKey >= today,
      );
  }, [
    calendar.days,
    viewingCurrentMonth,
    activeTypeId,
    mineOnly,
    currentUserId,
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

  /** Kompakt: jeder Tag hat höchstens eine Zeile → Datum direkt in der Zeile */
  const compact = filteredDays.every((day) => day.slots.length <= 1);
  // In der Einzelansicht steht der Newsletter-Name schon im Filter
  const showTypeName = !(compact && activeTypeId);

  function selectType(typeId: string | null) {
    setSelectedTypeId(typeId);
    router.replace(hrefFor(calendar.monthKey, typeId, mineOnly), {
      scroll: false,
    });
  }

  function selectScope(mine: boolean) {
    setMineOnly(mine);
    router.replace(hrefFor(calendar.monthKey, activeTypeId, mine), {
      scroll: false,
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Link
            href={hrefFor(calendar.prevMonth, activeTypeId, mineOnly)}
            className="btn btn-ghost px-2 py-1 text-sm"
          >
            ←
          </Link>
          <div className="min-w-[9rem] text-center">
            <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold capitalize">
              {calendar.monthLabel}
            </h2>
            <p className="text-[10px] text-[var(--muted)]">
              {openCount} offen
              {filterActive || (fromTodayOnly && viewingCurrentMonth)
                ? " · gefiltert"
                : ""}
            </p>
          </div>
          <Link
            href={hrefFor(calendar.nextMonth, activeTypeId, mineOnly)}
            className="btn btn-ghost px-2 py-1 text-sm"
          >
            →
          </Link>
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
          <Link
            href="/settings/newsletter"
            className="btn btn-ghost px-3 py-1.5 text-sm"
          >
            Einstellungen
          </Link>
        </div>
      </div>

      <div className="-mx-4 flex items-center gap-1 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
        <div
          className="inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded-full border border-[var(--border)] p-0.5"
          role="radiogroup"
          aria-label="Ansicht"
        >
          {(
            [
              [false, "Alle Newsletter"],
              [true, "Meine Newsletter"],
            ] as const
          ).map(([mine, label]) => (
            <button
              key={label}
              type="button"
              role="radio"
              aria-checked={mineOnly === mine}
              className={mineOnly === mine ? "rounded-full bg-[var(--fg)] px-2.5 py-0.5 text-xs font-medium text-[var(--bg-elevated)]" : "rounded-full px-2.5 py-0.5 text-xs text-[var(--muted)] hover:text-[var(--fg)]"}
              onClick={() => selectScope(mine)}
            >
              {label}
            </button>
          ))}
        </div>
        <span
          className="mx-1 h-4 w-px shrink-0 bg-[var(--border)]"
          aria-hidden
        />
        {types.map((t) => {
          const active = activeTypeId === t.id;
          const color = t.color || NEWSLETTER_TYPE_COLOR_DEFAULT;
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={active}
              className={
                active
                  ? "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium"
                  : "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-[var(--border)] px-2.5 py-0.5 text-xs text-[var(--muted)]"
              }
              style={
                active
                  ? {
                      borderColor: color,
                      background: newsletterTypeSoftBackground(color, 18),
                    }
                  : undefined
              }
              title={active ? "Klicken, um alle Newsletter zu zeigen" : undefined}
              onClick={() => selectType(active ? null : t.id)}
            >
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ background: color }}
                aria-hidden
              />
              {t.name}
            </button>
          );
        })}
      </div>

      <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]">
        {compact ? (
          <ul>
            {filteredDays.map((day, i) => {
              const newWeek =
                i > 0 &&
                weekStartKey(day.dateKey) !==
                  weekStartKey(filteredDays[i - 1].dateKey);
              const slot = day.slots[0];
              return (
                <SlotRow
                  key={`${slot.typeId}-${slot.dateKey}`}
                  slot={slot}
                  members={members}
                  dateLabel={`${day.weekdayLabel} ${shortDate(day.dateKey)}`}
                  showTypeName={showTypeName}
                  rowClassName={
                    i === 0
                      ? undefined
                      : newWeek
                        ? "border-t-2 border-t-black/30"
                        : "border-t border-t-[var(--border)]"
                  }
                />
              );
            })}
          </ul>
        ) : (
          filteredDays.map((day, dayIndex) => (
            <section
              key={day.dateKey}
              className={
                dayIndex > 0 ? "border-t border-[var(--border)]" : undefined
              }
            >
              <header className="bg-black/[0.03] px-3 py-1 text-xs font-semibold tracking-wide text-[var(--muted)]">
                {day.weekdayLabel} · {day.dateKey}
                {day.holidayName ? (
                  <span className="ml-2 font-normal">· {day.holidayName}</span>
                ) : null}
              </header>
              <ul className="divide-y divide-[var(--border)]">
                {day.slots.map((slot) => (
                  <SlotRow
                    key={`${slot.typeId}-${slot.dateKey}`}
                    slot={slot}
                    members={members}
                  />
                ))}
              </ul>
            </section>
          ))
        )}
        {filteredDays.length === 0 && (
          <p className="px-3 py-4 text-sm text-[var(--muted)]">
            Keine Erscheinungstage in diesem Monat
            {mineOnly
              ? " mit dir als Autor:in"
              : activeTypeId
                ? " für die gewählte Ausgabe"
                : ""}
            .
            {fromTodayOnly && viewingCurrentMonth
              ? " Oder «Ab heute» ausschalten."
              : ""}
          </p>
        )}
      </div>
    </div>
  );
}
