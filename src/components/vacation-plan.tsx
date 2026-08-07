"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  cancelVacationRequest,
  createVacationRequest,
  reviewVacationRequest,
  updateVacationRequest,
} from "@/lib/actions";
import { VACATION_STATUS_LABELS } from "@/lib/vacation-constants";
import type { VacationStatus } from "@/generated/prisma/client";

type Member = { id: string; name: string };

export type VacationRow = {
  id: string;
  startDate: string;
  endDate: string;
  note: string | null;
  status: VacationStatus;
  user: Member;
  reviewedBy: Member | null;
};

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"] as const;
const BAR_COLORS = [
  "bg-[#ffd9ce] border-[#f0b8a8]",
  "bg-[#ffe9a8] border-[#e8d078]",
  "bg-[#cfe9ff] border-[#9ec9ef]",
  "bg-[#e0f0d4] border-[#b5d49a]",
  "bg-[#edd9ff] border-[#c9aee0]",
];

function formatRange(start: string, end: string) {
  const opts: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "short",
    year: "numeric",
  };
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  if (!sy || !sm || !sd || !ey || !em || !ed) return `${start} – ${end}`;
  const from = new Date(Date.UTC(sy, sm - 1, sd)).toLocaleDateString(
    "de-CH",
    opts,
  );
  const to = new Date(Date.UTC(ey, em - 1, ed)).toLocaleDateString(
    "de-CH",
    opts,
  );
  return start === end ? from : `${from} – ${to}`;
}

function toDateKeyUTC(y: number, m0: number, d: number) {
  return `${y}-${String(m0 + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function todayKey() {
  const n = new Date();
  return toDateKeyUTC(n.getFullYear(), n.getMonth(), n.getDate());
}

function parseKey(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return { y: y!, m0: m! - 1, d: d! };
}

function addDaysKey(key: string, days: number) {
  const { y, m0, d } = parseKey(key);
  const dt = new Date(Date.UTC(y, m0, d + days));
  return dt.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string) {
  const pa = parseKey(a);
  const pb = parseKey(b);
  const da = Date.UTC(pa.y, pa.m0, pa.d);
  const db = Date.UTC(pb.y, pb.m0, pb.d);
  return Math.round((db - da) / 86400000);
}

/** Monday-based weekday: 0=Mo … 6=So */
function mondayIndex(key: string) {
  const { y, m0, d } = parseKey(key);
  const utc = new Date(Date.UTC(y, m0, d));
  return (utc.getUTCDay() + 6) % 7;
}

function monthLabel(y: number, m0: number) {
  return new Date(Date.UTC(y, m0, 1)).toLocaleDateString("de-CH", {
    month: "long",
    year: "numeric",
  });
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
}

function colorForUser(userId: string) {
  let hash = 0;
  for (let i = 0; i < userId.length; i += 1) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return BAR_COLORS[hash % BAR_COLORS.length]!;
}

function statusBadge(status: VacationStatus) {
  if (status === "approved") return "badge badge-done";
  if (status === "rejected") return "badge badge-muted";
  return "badge badge-doing";
}

type CalDay = {
  dateKey: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
};

type WeekBar = {
  vacation: VacationRow;
  startCol: number;
  span: number;
  lane: number;
  continuesLeft: boolean;
  continuesRight: boolean;
};

function buildMonthWeeks(y: number, m0: number): CalDay[][] {
  const today = todayKey();
  const first = toDateKeyUTC(y, m0, 1);
  const startOffset = mondayIndex(first);
  const gridStart = addDaysKey(first, -startOffset);
  const lastDay = new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
  const last = toDateKeyUTC(y, m0, lastDay);
  const endPad = 6 - mondayIndex(last);
  const gridEnd = addDaysKey(last, endPad);

  const weeks: CalDay[][] = [];
  let cursor = gridStart;
  while (cursor <= gridEnd) {
    const week: CalDay[] = [];
    for (let i = 0; i < 7; i += 1) {
      const key = addDaysKey(cursor, i);
      const { m0: km, d } = parseKey(key);
      week.push({
        dateKey: key,
        day: d,
        inMonth: km === m0,
        isToday: key === today,
      });
    }
    weeks.push(week);
    cursor = addDaysKey(cursor, 7);
  }
  return weeks;
}

function barsForWeek(week: CalDay[], vacations: VacationRow[]): WeekBar[] {
  const weekStart = week[0]!.dateKey;
  const weekEnd = week[6]!.dateKey;

  const overlapping = vacations
    .filter((v) => v.startDate <= weekEnd && v.endDate >= weekStart)
    .sort((a, b) => {
      const byName = a.user.name.localeCompare(b.user.name, "de");
      if (byName !== 0) return byName;
      return a.startDate.localeCompare(b.startDate);
    });

  const laneEnds: number[] = [];
  const bars: WeekBar[] = [];

  for (const v of overlapping) {
    const segStart = v.startDate < weekStart ? weekStart : v.startDate;
    const segEnd = v.endDate > weekEnd ? weekEnd : v.endDate;
    const startCol = daysBetween(weekStart, segStart);
    const endCol = daysBetween(weekStart, segEnd);
    if (startCol < 0 || endCol > 6 || startCol > endCol) continue;

    let lane = laneEnds.findIndex((end) => end < startCol);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(endCol);
    } else {
      laneEnds[lane] = endCol;
    }

    bars.push({
      vacation: v,
      startCol,
      span: endCol - startCol + 1,
      lane,
      continuesLeft: v.startDate < weekStart,
      continuesRight: v.endDate > weekEnd,
    });
  }

  return bars;
}

export function VacationPlan({
  requests,
  currentUserId,
  isAdmin,
}: {
  requests: VacationRow[];
  currentUserId: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<VacationRow | null>(null);
  const [mineOnly, setMineOnly] = useState(false);

  const now = new Date();
  const [cursor, setCursor] = useState(() => ({
    y: now.getFullYear(),
    m0: now.getMonth(),
  }));

  const mine = requests.filter((r) => r.user.id === currentUserId);
  const pendingReview = requests.filter((r) => r.status === "pending");
  const approved = requests.filter((r) => r.status === "approved");
  const calendarApproved = useMemo(
    () =>
      requests.filter(
        (r) =>
          r.status === "approved" &&
          (!mineOnly || r.user.id === currentUserId),
      ),
    [requests, mineOnly, currentUserId],
  );

  const weeks = useMemo(
    () => buildMonthWeeks(cursor.y, cursor.m0),
    [cursor.y, cursor.m0],
  );

  function shiftMonth(delta: number) {
    setCursor((c) => {
      const d = new Date(Date.UTC(c.y, c.m0 + delta, 1));
      return { y: d.getUTCFullYear(), m0: d.getUTCMonth() };
    });
  }

  function goToday() {
    const n = new Date();
    setCursor({ y: n.getFullYear(), m0: n.getMonth() });
  }

  function run(
    action: () => Promise<{ error?: string; ok?: true }>,
    success?: string,
  ) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      if (result?.error) {
        setError(result.error);
        return;
      }
      if (success) setMessage(success);
      setFormOpen(false);
      setEditing(null);
      router.refresh();
    });
  }

  function openCreateForm() {
    setEditing(null);
    setError(null);
    setMessage(null);
    setFormOpen(true);
  }

  function openEditForm(row: VacationRow) {
    setEditing(row);
    setError(null);
    setMessage(null);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditing(null);
    setError(null);
    setMessage(null);
  }

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => shiftMonth(-1)}
              aria-label="Vorheriger Monat"
            >
              ←
            </button>
            <div>
              <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight capitalize">
                {monthLabel(cursor.y, cursor.m0)}
              </h2>
              <p className="mt-1 text-sm text-[var(--muted)]">
                {mineOnly
                  ? "Nur deine genehmigten Ferien."
                  : "Genehmigte Ferien des gesamten Teams."}
              </p>
            </div>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => shiftMonth(1)}
              aria-label="Nächster Monat"
            >
              →
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              aria-pressed={mineOnly}
              className={[
                "rounded-full border px-3 py-1.5 text-sm font-semibold transition",
                mineOnly
                  ? "border-[var(--fg)] bg-[var(--fg)] text-white"
                  : "border-[var(--border)] bg-white text-[var(--muted)] hover:border-[var(--fg)] hover:text-[var(--fg)]",
              ].join(" ")}
              onClick={() => setMineOnly((v) => !v)}
            >
              Meine Ferien
            </button>
            <button
              type="button"
              className="btn btn-ghost px-3 py-1.5 text-sm"
              onClick={goToday}
            >
              Heute
            </button>
            <button
              type="button"
              className="btn btn-primary"
              aria-expanded={formOpen}
              onClick={() => {
                if (formOpen) closeForm();
                else openCreateForm();
              }}
            >
              {formOpen && !editing
                ? "Schliessen"
                : formOpen && editing
                  ? "Schliessen"
                  : "Ferien eintragen"}
            </button>
          </div>
        </div>

        {formOpen && (
          <div className="card space-y-4 p-5">
            <div>
              <h3 className="font-[family-name:var(--font-display)] text-base font-semibold">
                {editing ? "Ferien bearbeiten" : "Ferien eintragen"}
              </h3>
              <p className="mt-1 text-sm text-[var(--muted)]">
                {editing
                  ? "Nach dem Speichern ist erneut eine Admin-Freigabe nötig."
                  : "Anfragen gelten zuerst als offen und müssen von einem Admin freigegeben werden."}
              </p>
            </div>
            <form
              key={editing?.id ?? "create"}
              className="grid gap-3 sm:grid-cols-2"
              action={(fd) => {
                if (editing) {
                  run(
                    async () => updateVacationRequest(fd),
                    "Gespeichert — wartet auf Freigabe.",
                  );
                } else {
                  run(
                    async () => createVacationRequest(fd),
                    "Anfrage gesendet.",
                  );
                }
              }}
            >
              {editing && <input type="hidden" name="id" value={editing.id} />}
              <div className="field">
                <label htmlFor="vac-start">Von</label>
                <input
                  id="vac-start"
                  name="startDate"
                  type="date"
                  required
                  defaultValue={editing?.startDate ?? ""}
                />
              </div>
              <div className="field">
                <label htmlFor="vac-end">Bis</label>
                <input
                  id="vac-end"
                  name="endDate"
                  type="date"
                  required
                  defaultValue={editing?.endDate ?? ""}
                />
              </div>
              <div className="field sm:col-span-2">
                <label htmlFor="vac-note">Notiz (optional)</label>
                <input
                  id="vac-note"
                  name="note"
                  placeholder="z. B. Skiwoche, Elternzeit…"
                  defaultValue={editing?.note ?? ""}
                />
              </div>
              <div className="flex flex-wrap gap-2 sm:col-span-2">
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={pending}
                >
                  {pending
                    ? "…"
                    : editing
                      ? "Änderungen speichern"
                      : "Anfrage senden"}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={pending}
                  onClick={closeForm}
                >
                  Abbrechen
                </button>
              </div>
            </form>
            {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
            {message && (
              <p className="text-sm font-semibold text-[var(--accent)]">
                {message}
              </p>
            )}
          </div>
        )}

        <div className="overflow-x-auto rounded-[var(--radius)] border-2 border-[var(--border)] bg-white">
          <div className="min-w-[720px]">
            <div className="grid grid-cols-7 border-b-2 border-[var(--border)] bg-[color-mix(in_oklab,var(--bg)_70%,white)]">
              {WEEKDAYS.map((d) => (
                <div
                  key={d}
                  className="px-2 py-2 text-center text-xs font-semibold tracking-wide text-[var(--muted)] uppercase"
                >
                  {d}
                </div>
              ))}
            </div>

            {weeks.map((week) => {
              const bars = barsForWeek(week, calendarApproved);
              const laneCount =
                bars.reduce((max, b) => Math.max(max, b.lane + 1), 0) || 0;
              const barsHeight = Math.max(laneCount, 1) * 46 + 8;

              return (
                <div
                  key={week[0]!.dateKey}
                  className="relative grid grid-cols-7 border-b border-[var(--border)] last:border-b-0"
                  style={{ minHeight: 36 + barsHeight }}
                >
                  {week.map((day) => (
                    <div
                      key={day.dateKey}
                      className={[
                        "border-r border-[var(--border)] last:border-r-0 px-1.5 pt-1.5",
                        day.inMonth ? "bg-white" : "bg-[#f5f5f5]",
                      ].join(" ")}
                    >
                      <span
                        className={[
                          "inline-flex size-6 items-center justify-center text-xs font-bold",
                          day.isToday
                            ? "rounded-full bg-[var(--danger)] text-white"
                            : day.inMonth
                              ? "text-[var(--fg)]"
                              : "text-[var(--muted)]",
                        ].join(" ")}
                      >
                        {day.day}
                      </span>
                    </div>
                  ))}

                  <div
                    className="absolute inset-x-0 top-8 grid grid-cols-7 gap-y-1 px-0.5"
                    style={{ height: barsHeight }}
                  >
                    {bars.map((bar) => {
                      const own = bar.vacation.user.id === currentUserId;
                      return (
                        <button
                          type="button"
                          key={`${week[0]!.dateKey}-${bar.vacation.id}`}
                          title={`${bar.vacation.user.name}: ${formatRange(bar.vacation.startDate, bar.vacation.endDate)}${own ? " — klicken zum Bearbeiten" : ""}`}
                          disabled={!own || pending}
                          onClick={() => {
                            if (own) openEditForm(bar.vacation);
                          }}
                          className={[
                            "mx-0.5 flex min-w-0 flex-col justify-center gap-0.5 border px-1.5 py-1 text-left text-[0.7rem] leading-tight shadow-sm",
                            colorForUser(bar.vacation.user.id),
                            bar.continuesLeft ? "rounded-l-sm" : "rounded-l-md",
                            bar.continuesRight
                              ? "rounded-r-sm"
                              : "rounded-r-md",
                            own
                              ? "cursor-pointer hover:brightness-95"
                              : "cursor-default",
                          ].join(" ")}
                          style={{
                            gridColumn: `${bar.startCol + 1} / span ${bar.span}`,
                            gridRow: bar.lane + 1,
                          }}
                        >
                          <span className="truncate font-semibold">Ferien</span>
                          <span className="flex min-w-0 items-center gap-1">
                            <span className="inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-black/15 text-[0.55rem] font-bold">
                              {initials(bar.vacation.user.name)}
                            </span>
                            <span className="truncate font-semibold">
                              {bar.vacation.user.name}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {approved.length === 0 && (
          <p className="text-center text-sm text-[var(--muted)]">
            Noch keine genehmigten Ferien — nach Freigabe erscheinen sie hier.
          </p>
        )}
      </section>

      {isAdmin && pendingReview.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-[var(--muted)] uppercase">
            Offene Anfragen ({pendingReview.length})
          </h2>
          <ul className="card divide-y divide-[var(--border)] overflow-hidden">
            {pendingReview.map((r) => (
              <li
                key={r.id}
                className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-semibold">{r.user.name}</p>
                  <p className="mt-0.5 text-sm">
                    {formatRange(r.startDate, r.endDate)}
                  </p>
                  {r.note && (
                    <p className="mt-1 text-xs text-[var(--muted)]">{r.note}</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn btn-primary px-3 py-1.5 text-sm"
                    disabled={pending}
                    onClick={() => {
                      run(async () => {
                        const fd = new FormData();
                        fd.set("id", r.id);
                        fd.set("decision", "approved");
                        return reviewVacationRequest(fd);
                      });
                    }}
                  >
                    Freigeben
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost px-3 py-1.5 text-sm"
                    disabled={pending}
                    onClick={() => {
                      run(async () => {
                        const fd = new FormData();
                        fd.set("id", r.id);
                        fd.set("decision", "rejected");
                        return reviewVacationRequest(fd);
                      });
                    }}
                  >
                    Ablehnen
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-[var(--muted)] uppercase">
          Meine Anfragen ({mine.length})
        </h2>
        {mine.length === 0 ? (
          <div className="card px-4 py-8 text-center text-sm text-[var(--muted)]">
            Du hast noch keine Anfragen gestellt.
          </div>
        ) : (
          <ul className="card divide-y divide-[var(--border)] overflow-hidden">
            {mine.map((r) => (
              <li
                key={r.id}
                className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">
                      {formatRange(r.startDate, r.endDate)}
                    </p>
                    <span className={statusBadge(r.status)}>
                      {VACATION_STATUS_LABELS[r.status]}
                    </span>
                  </div>
                  {r.note && (
                    <p className="mt-1 text-xs text-[var(--muted)]">{r.note}</p>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn btn-ghost px-3 py-1.5 text-sm"
                    disabled={pending}
                    onClick={() => openEditForm(r)}
                  >
                    Bearbeiten
                  </button>
                  {(r.status === "pending" || isAdmin) && (
                    <button
                      type="button"
                      className="btn btn-ghost px-3 py-1.5 text-sm text-[var(--danger)]"
                      disabled={pending}
                      onClick={() => {
                        if (
                          !confirm(
                            r.status === "pending"
                              ? "Anfrage zurückziehen?"
                              : "Eintrag löschen?",
                          )
                        ) {
                          return;
                        }
                        run(async () => {
                          const fd = new FormData();
                          fd.set("id", r.id);
                          return cancelVacationRequest(fd);
                        });
                      }}
                    >
                      {r.status === "pending" ? "Zurückziehen" : "Löschen"}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
