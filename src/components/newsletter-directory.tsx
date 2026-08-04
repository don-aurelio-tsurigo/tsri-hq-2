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
  members,
  currentUserId,
  calendar,
}: {
  members: Member[];
  currentUserId: string;
  calendar: CalendarMonth;
}) {
  const today = todayDateKey();
  const openCount = useMemo(
    () =>
      calendar.days.reduce(
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
    [calendar.days],
  );

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Link
              href={`/newsletter?month=${calendar.prevMonth}`}
              className="btn btn-ghost"
            >
              ←
            </Link>
            <div>
              <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold capitalize">
                {calendar.monthLabel}
              </h2>
              <p className="text-sm text-[var(--muted)]">
                {openCount} offene Slot{openCount === 1 ? "" : "s"} in diesem
                Monat
              </p>
            </div>
            <Link
              href={`/newsletter?month=${calendar.nextMonth}`}
              className="btn btn-ghost"
            >
              →
            </Link>
          </div>
          <Link
            href={`/newsletter?month=${calendar.currentMonth}`}
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
        ) : (
          <ul className="space-y-4">
            {calendar.days.map((day) => {
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
