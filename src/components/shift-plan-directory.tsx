"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink } from "lucide-react";
import {
  clearShiftSlot,
  confirmShiftPlanMonth,
  generateShiftPlanProposal,
  upsertShiftSlot,
} from "@/lib/actions";
import {
  NEWSLETTER_TYPE_COLOR_DEFAULT,
  newsletterTypeSoftBackground,
} from "@/lib/newsletter-colors";

type Member = { id: string; name: string };

type Slot = {
  dateKey: string;
  typeId: string;
  typeName: string;
  typeColor: string;
  isEveningShift: boolean;
  campaign: {
    id: string;
    authorId: string | null;
    authorName: string | null;
    campaignUrl: string | null;
    status: string;
    note: string | null;
  } | null;
};

type Day = {
  dateKey: string;
  weekdayLabel: string;
  slots: Slot[];
};

type TypeOption = { id: string; name: string; color: string };

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

export function ShiftPlanDirectory({
  types,
  initialTypeId,
  initialMineOnly,
  currentUserId,
  members,
  canManage,
  calendar,
}: {
  types: TypeOption[];
  /** null = alle Schichten */
  initialTypeId: string | null;
  initialMineOnly: boolean;
  currentUserId: string;
  members: Member[];
  canManage: boolean;
  calendar: {
    monthLabel: string;
    monthKey: string;
    prevMonth: string;
    nextMonth: string;
    days: Day[];
  };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(
    initialTypeId,
  );
  const [mineOnly, setMineOnly] = useState(initialMineOnly);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [flash, setFlash] = useState<string | null>(null);

  // Gelöschte/deaktivierte Typen fallen auf «Alle Schichten» zurück
  const activeTypeId =
    selectedTypeId && types.some((t) => t.id === selectedTypeId)
      ? selectedTypeId
      : null;

  const [year, month] = calendar.monthKey.split("-").map(Number);

  const filteredDays = useMemo(
    () =>
      calendar.days
        .map((day) => ({
          ...day,
          slots: day.slots.filter(
            (s) =>
              (!activeTypeId || s.typeId === activeTypeId) &&
              (!mineOnly || s.campaign?.authorId === currentUserId),
          ),
        }))
        .filter((day) => day.slots.length > 0),
    [calendar.days, activeTypeId, mineOnly, currentUserId],
  );

  const proposedCount = useMemo(
    () =>
      filteredDays.reduce(
        (n, day) =>
          n +
          day.slots.filter((s) => s.campaign?.status === "proposed").length,
        0,
      ),
    [filteredDays],
  );

  function hrefFor(monthKey: string, typeId: string | null, mine: boolean) {
    const params = new URLSearchParams();
    params.set("month", monthKey);
    if (typeId) params.set("type", typeId);
    if (mine) params.set("mine", "1");
    return `/schichtplan?${params.toString()}`;
  }

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

  function assignAuthor(slot: Slot, authorId: string) {
    setError(null);
    const fd = new FormData();
    fd.set("typeId", slot.typeId);
    fd.set("date", slot.dateKey);
    fd.set("authorId", authorId);
    startTransition(async () => {
      const result = await upsertShiftSlot(fd);
      if (result?.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function clearSlot(slot: Slot) {
    if (!slot.campaign) return;
    setError(null);
    const fd = new FormData();
    fd.set("id", slot.campaign.id);
    startTransition(async () => {
      const result = await clearShiftSlot(fd);
      if (result?.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function generate() {
    setError(null);
    setWarnings([]);
    setFlash(null);
    const fd = new FormData();
    fd.set("month", String(month));
    fd.set("year", String(year));
    startTransition(async () => {
      const result = await generateShiftPlanProposal(fd);
      if (result && "error" in result && result.error) {
        setError(result.error);
        return;
      }
      if (result && "warnings" in result && result.warnings?.length) {
        setWarnings(result.warnings);
      }
      if (result && "created" in result) {
        setFlash(`Vorschlag erstellt (${result.created} Zuweisungen).`);
      }
      router.refresh();
    });
  }

  function confirmMonth() {
    if (
      !window.confirm(
        `Alle ${proposedCount} Vorschläge in diesem Monat bestätigen?`,
      )
    ) {
      return;
    }
    setError(null);
    setFlash(null);
    const fd = new FormData();
    fd.set("month", String(month));
    fd.set("year", String(year));
    startTransition(async () => {
      const result = await confirmShiftPlanMonth(fd);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setFlash(
        result && "count" in result
          ? `${result.count} Vorschläge bestätigt.`
          : "Monat bestätigt.",
      );
      setWarnings([]);
      router.refresh();
    });
  }

  /** Kompakt: jeder Tag hat höchstens eine Zeile → Datum direkt in der Zeile */
  const compact = filteredDays.every((day) => day.slots.length <= 1);
  // In der Einzelansicht steht der Schichtname schon im Filter
  const showTypeName = !(compact && activeTypeId);

  function renderSlot(
    slot: Slot,
    dateLabel: string | null,
    rowClassName?: string,
  ) {
    const proposed = slot.campaign?.status === "proposed";
    const skipped = slot.campaign?.status === "skipped";
    const color = slot.typeColor || NEWSLETTER_TYPE_COLOR_DEFAULT;
    return (
      <li
        key={`${slot.typeId}:${slot.dateKey}`}
        className={[
          "flex flex-wrap items-center gap-x-2 gap-y-1 border-l-[3px] px-3 py-1.5 sm:flex-nowrap sm:py-1",
          proposed ? "bg-amber-50/50" : skipped ? "opacity-55" : "",
          rowClassName ?? "",
        ].join(" ")}
        style={{
          borderLeftColor: color,
          background: proposed
            ? undefined
            : skipped
              ? undefined
              : newsletterTypeSoftBackground(color, 8),
        }}
      >
        {dateLabel ? (
          <span className="w-[5.5rem] shrink-0 text-sm font-semibold tabular-nums">
            {dateLabel}
          </span>
        ) : null}
        <div
          className={[
            "min-w-0 flex-1 sm:flex-none sm:shrink-0",
            showTypeName ? "sm:w-44" : "sm:w-24",
          ].join(" ")}
        >
          <p className="truncate text-sm leading-tight">
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
            {proposed ? (
              <span className="ml-1.5 text-[10px] font-medium text-amber-800">
                Vorschlag
              </span>
            ) : null}
            {skipped ? (
              <span className="ml-1.5 text-[10px] text-[var(--muted)]">
                fällt aus
              </span>
            ) : null}
          </p>
          {slot.campaign?.note ? (
            <p className="truncate text-[10px] leading-tight text-[var(--muted)]">
              {slot.campaign.note}
            </p>
          ) : null}
        </div>
        <select
          className="input order-last h-8 w-full min-w-0 py-0 text-sm sm:order-none sm:h-7 sm:w-auto sm:grow sm:max-w-xs"
          disabled={pending || skipped}
          value={slot.campaign?.authorId ?? ""}
          onChange={(e) => assignAuthor(slot, e.target.value)}
        >
          <option value="">— Offen —</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <div className="shrink-0 text-xs sm:w-[5.5rem]">
          {slot.campaign?.campaignUrl ? (
            <a
              href={slot.campaign.campaignUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium text-[var(--accent-hover)] underline underline-offset-2"
            >
              Kampagne
              <ExternalLink className="size-3 shrink-0" aria-hidden />
            </a>
          ) : (
            <span className="hidden text-[var(--muted)] sm:inline">
              —
            </span>
          )}
        </div>
        {slot.campaign && !skipped ? (
          <button
            type="button"
            className="shrink-0 text-xs text-[var(--muted)] underline-offset-2 hover:underline"
            disabled={pending}
            onClick={() => clearSlot(slot)}
          >
            Leeren
          </button>
        ) : (
          <span className="hidden w-10 shrink-0 sm:block" aria-hidden />
        )}
      </li>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex w-full items-center justify-between gap-1 sm:w-auto sm:justify-start">
          <Link
            href={hrefFor(calendar.prevMonth, activeTypeId, mineOnly)}
            className="btn btn-ghost px-2 py-1 text-sm"
          >
            ←
          </Link>
          <h2 className="min-w-[9rem] text-center font-[family-name:var(--font-display)] text-lg font-semibold capitalize">
            {calendar.monthLabel}
          </h2>
          <Link
            href={hrefFor(calendar.nextMonth, activeTypeId, mineOnly)}
            className="btn btn-ghost px-2 py-1 text-sm"
          >
            →
          </Link>
        </div>

        {canManage && (
          <div className="flex w-full flex-wrap gap-1.5 sm:w-auto">
            <button
              type="button"
              className="btn btn-primary px-3 py-1.5 text-sm"
              disabled={pending}
              onClick={generate}
            >
              Vorschlag generieren
            </button>
            <button
              type="button"
              className="btn px-3 py-1.5 text-sm"
              disabled={pending || proposedCount === 0}
              onClick={confirmMonth}
            >
              Monat bestätigen
              {proposedCount > 0 ? ` (${proposedCount})` : ""}
            </button>
            <Link
              href="/settings/schichtplan"
              className="btn btn-ghost px-3 py-1.5 text-sm"
            >
              Einstellungen
            </Link>
          </div>
        )}
      </div>

      <div className="-mx-4 flex items-center gap-1 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
        <div
          className="inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded-full border border-[var(--border)] p-0.5"
          role="radiogroup"
          aria-label="Ansicht"
        >
          {(
            [
              [false, "Alle Schichten"],
              [true, "Meine Schichten"],
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
              title={active ? "Klicken, um alle Schichttypen zu zeigen" : undefined}
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

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs text-red-800">
          {error}
        </p>
      )}
      {flash && (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs text-emerald-900">
          {flash}
        </p>
      )}
      {warnings.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-950">
          <p className="font-medium">Hinweise zum Vorschlag</p>
          <ul className="mt-0.5 list-disc pl-4">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]">
        {compact ? (
          <ul>
            {filteredDays.map((day, i) => {
              const newWeek =
                i > 0 &&
                weekStartKey(day.dateKey) !==
                  weekStartKey(filteredDays[i - 1].dateKey);
              return renderSlot(
                day.slots[0],
                `${day.weekdayLabel} ${shortDate(day.dateKey)}`,
                i === 0
                  ? undefined
                  : newWeek
                    ? "border-t-2 border-t-black/30"
                    : "border-t border-t-[var(--border)]",
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
              <header className="bg-black/[0.03] px-3 py-1.5 text-sm font-semibold text-[var(--fg)]">
                {day.weekdayLabel} · {day.dateKey}
              </header>
              <ul className="divide-y divide-[var(--border)]">
                {day.slots.map((slot) => renderSlot(slot, null))}
              </ul>
            </section>
          ))
        )}
        {filteredDays.length === 0 && (
          <p className="px-3 py-4 text-sm text-[var(--muted)]">
            {mineOnly
              ? "Du hast in diesem Monat keine Schichten für diese Auswahl."
              : "Keine Schichten in diesem Monat für die gewählte Auswahl."}
          </p>
        )}
      </div>
    </div>
  );
}
