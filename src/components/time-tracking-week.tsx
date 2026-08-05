"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { deleteTimeEntry, upsertTimeEntry } from "@/lib/actions";
import {
  computeWorkedHours,
  formatHours,
  formatSegmentsSummary,
  segmentsOverlap,
  TIME_ENTRY_TYPE_LABELS,
  type TimeEntryTypeValue,
  type TimeSegmentInput,
} from "@/lib/time-tracking-constants";

type DayEntry = {
  id: string;
  type: TimeEntryTypeValue;
  note: string | null;
  breakMinutes: number;
  segments: TimeSegmentInput[];
};

type WeekDay = {
  dateKey: string;
  dateLabel: string;
  weekdayLabel: string;
  isWeekend: boolean;
  isToday: boolean;
  holidayName: string | null;
  baseSollHours: number;
  sollHours: number;
  workedHours: number;
  entry: DayEntry | null;
};

type WeekData = {
  startKey: string;
  endKey: string;
  weekLabel: string;
  prevWeek: string;
  nextWeek: string;
  pensumPercent: number;
  dailyTarget: number;
  sollHours: number;
  istHours: number;
  diffHours: number;
  monthSoll: number;
  monthIst: number;
  monthDiff: number;
  monthLabel: string;
  sickDays: number;
  vacationDays: number;
  days: WeekDay[];
};

type EditorSegment = {
  key: string;
  startTime: string;
  endTime: string;
};

function SummaryStat({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: string;
  emphasize?: "positive" | "negative" | "neutral";
}) {
  const color =
    emphasize === "positive"
      ? "text-emerald-700"
      : emphasize === "negative"
        ? "text-[var(--danger)]"
        : "text-[var(--fg)]";
  return (
    <div>
      <p className="text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">
        {label}
      </p>
      <p
        className={`mt-1 font-[family-name:var(--font-display)] text-2xl font-semibold tabular-nums ${color}`}
      >
        {value}
      </p>
    </div>
  );
}

function formatSignedHours(hours: number) {
  const sign = hours > 0 ? "+" : "";
  return `${sign}${formatHours(hours)} h`;
}

function segmentsFromEntry(entry: DayEntry | null): EditorSegment[] {
  if (!entry?.segments.length) {
    return [
      {
        key: crypto.randomUUID(),
        startTime: "09:00",
        endTime: "17:00",
      },
    ];
  }
  return entry.segments.map((s) => ({
    key: crypto.randomUUID(),
    startTime: s.startTime,
    endTime: s.endTime,
  }));
}

function toPayload(segments: EditorSegment[]): TimeSegmentInput[] {
  return segments.map((s) => ({
    startTime: s.startTime,
    endTime: s.endTime,
  }));
}

function DayEditor({
  day,
  dailyTarget,
  onDone,
}: {
  day: WeekData["days"][number];
  dailyTarget: number;
  onDone: () => void;
}) {
  const [type, setType] = useState<TimeEntryTypeValue>(
    day.entry?.type ?? (day.holidayName ? "holiday" : "work"),
  );
  const [segments, setSegments] = useState<EditorSegment[]>(() =>
    segmentsFromEntry(day.entry),
  );
  const [breakMinutes, setBreakMinutes] = useState(
    String(day.entry?.breakMinutes ?? 0),
  );
  const [note, setNote] = useState(
    day.entry?.note ?? day.holidayName ?? "",
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const payload = useMemo(() => toPayload(segments), [segments]);
  const breakValue = Math.max(0, Math.floor(Number(breakMinutes)) || 0);

  const preview = useMemo(() => {
    if (type !== "work") return null;
    return computeWorkedHours(payload, breakValue);
  }, [type, payload, breakValue]);

  function save() {
    setError(null);
    if (type === "work") {
      if (payload.length === 0) {
        setError("Mindestens ein Arbeitssegment nötig.");
        return;
      }
      if (payload.some((s) => !s.startTime || !s.endTime)) {
        setError("Jedes Segment braucht Beginn und Schluss.");
        return;
      }
      if (segmentsOverlap(payload)) {
        setError("Segmente überschneiden sich.");
        return;
      }
    }

    const fd = new FormData();
    fd.set("date", day.dateKey);
    fd.set("type", type);
    if (note.trim()) fd.set("note", note.trim());
    fd.set("segments", JSON.stringify(type === "work" ? payload : []));
    fd.set("breakMinutes", String(type === "work" ? breakValue : 0));
    startTransition(async () => {
      const result = await upsertTimeEntry(fd);
      if (result?.error) {
        setError(result.error);
        return;
      }
      onDone();
    });
  }

  function remove() {
    setError(null);
    const fd = new FormData();
    fd.set("date", day.dateKey);
    startTransition(async () => {
      const result = await deleteTimeEntry(fd);
      if (result?.error) {
        setError(result.error);
        return;
      }
      onDone();
    });
  }

  function addSegment() {
    setSegments((prev) => [
      ...prev,
      {
        key: crypto.randomUUID(),
        startTime: "13:00",
        endTime: "17:00",
      },
    ]);
  }

  function removeSegment(key: string) {
    setSegments((prev) =>
      prev.length <= 1 ? prev : prev.filter((s) => s.key !== key),
    );
  }

  function updateSegment(
    key: string,
    patch: Partial<Pick<EditorSegment, "startTime" | "endTime">>,
  ) {
    setSegments((prev) =>
      prev.map((s) => (s.key === key ? { ...s, ...patch } : s)),
    );
  }

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-[var(--border)] bg-[var(--bg)]/60 p-3">
      <div className="flex flex-wrap gap-2">
        {(
          Object.keys(TIME_ENTRY_TYPE_LABELS) as TimeEntryTypeValue[]
        ).map((key) => (
          <button
            key={key}
            type="button"
            className={[
              "rounded-full border px-3 py-1 text-xs font-bold transition-colors",
              type === key
                ? "border-[var(--fg)] bg-[var(--highlight)] text-[var(--fg)]"
                : "border-[var(--border)] bg-white text-[var(--muted)] hover:border-[var(--fg)]",
            ].join(" ")}
            onClick={() => setType(key)}
          >
            {TIME_ENTRY_TYPE_LABELS[key]}
          </button>
        ))}
      </div>

      {type === "work" ? (
        <>
          <ul className="space-y-2">
            {segments.map((seg, index) => (
              <li
                key={seg.key}
                className="grid grid-cols-[1fr_1fr_auto] gap-2 rounded-lg border border-[var(--border)] bg-white p-2 sm:grid-cols-[auto_1fr_1fr_auto]"
              >
                <span className="hidden self-center text-xs font-semibold text-[var(--muted)] sm:inline">
                  #{index + 1}
                </span>
                <label className="field text-xs font-semibold text-[var(--muted)]">
                  Beginn
                  <input
                    type="time"
                    value={seg.startTime}
                    onChange={(e) =>
                      updateSegment(seg.key, { startTime: e.target.value })
                    }
                  />
                </label>
                <label className="field text-xs font-semibold text-[var(--muted)]">
                  Schluss
                  <input
                    type="time"
                    value={seg.endTime}
                    onChange={(e) =>
                      updateSegment(seg.key, { endTime: e.target.value })
                    }
                  />
                </label>
                <button
                  type="button"
                  className="self-end btn btn-ghost px-2 py-1 text-xs disabled:opacity-40"
                  disabled={segments.length <= 1}
                  onClick={() => removeSegment(seg.key)}
                >
                  Entfernen
                </button>
              </li>
            ))}
          </ul>

          <button
            type="button"
            className="text-sm font-semibold text-[var(--accent)] hover:underline"
            onClick={addSegment}
          >
            + Segment
          </button>

          <label className="field max-w-[10rem] text-xs font-semibold text-[var(--muted)]">
            Pause (Min.)
            <input
              type="number"
              min={0}
              max={24 * 60}
              step={5}
              value={breakMinutes}
              onChange={(e) => setBreakMinutes(e.target.value)}
            />
          </label>

          <div className="flex flex-wrap gap-6 text-sm">
            <div>
              <p className="text-xs font-semibold text-[var(--muted)]">Arbeit</p>
              <p className="font-bold tabular-nums">
                {preview != null ? `${formatHours(preview)} h` : "—"}
              </p>
              <p className="text-[0.7rem] text-[var(--muted)]">
                Soll {formatHours(dailyTarget)} h
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-[var(--muted)]">Pause</p>
              <p className="font-bold tabular-nums">{breakValue} Min.</p>
            </div>
          </div>
        </>
      ) : (
        <p className="text-sm text-[var(--muted)]">
          {type === "sick" &&
            "Krankheitstag — zählt nicht zum Soll (keine Zeitsegmente)."}
          {type === "vacation" &&
            "Ferientag — zählt nicht zum Soll (keine Zeitsegmente)."}
          {type === "holiday" &&
            "Feiertag — kein Soll an diesem Tag (keine Zeitsegmente)."}
        </p>
      )}

      <label className="field text-xs font-semibold text-[var(--muted)]">
        Bemerkung
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="optional"
        />
      </label>

      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-primary"
          disabled={pending}
          onClick={save}
        >
          {pending ? "…" : "Speichern"}
        </button>
        {day.entry && (
          <button
            type="button"
            className="btn btn-danger"
            disabled={pending}
            onClick={remove}
          >
            Löschen
          </button>
        )}
      </div>
    </div>
  );
}

export function TimeTrackingWeek({
  week,
  readOnly = false,
  weekBasePath = "/hours",
}: {
  week: WeekData;
  /** Admin-Detail: Einträge anzeigen, aber nicht bearbeiten. */
  readOnly?: boolean;
  /** Basis-URL für Wochen-Navigation, z.B. /settings/hours/[userId] */
  weekBasePath?: string;
}) {
  const router = useRouter();
  const [openKey, setOpenKey] = useState<string | null>(
    () => week.days.find((d) => d.isToday)?.dateKey ?? null,
  );

  const diffTone =
    week.diffHours > 0.01
      ? "positive"
      : week.diffHours < -0.01
        ? "negative"
        : "neutral";
  const monthTone =
    week.monthDiff > 0.01
      ? "positive"
      : week.monthDiff < -0.01
        ? "negative"
        : "neutral";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link
            href={`${weekBasePath}?week=${week.prevWeek}`}
            className="btn btn-ghost"
          >
            ←
          </Link>
          <div>
            <p className="font-[family-name:var(--font-display)] text-lg font-semibold">
              {week.weekLabel}
            </p>
            <p className="text-sm text-[var(--muted)]">
              Pensum {week.pensumPercent}% · Soll/Tag{" "}
              {formatHours(week.dailyTarget)} h
            </p>
          </div>
          <Link
            href={`${weekBasePath}?week=${week.nextWeek}`}
            className="btn btn-ghost"
          >
            →
          </Link>
        </div>
        <Link
          href={weekBasePath}
          className="text-sm font-medium text-[var(--accent)] hover:underline"
        >
          Diese Woche
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="card grid grid-cols-3 gap-4 p-4">
          <SummaryStat label="Ist Woche" value={`${formatHours(week.istHours)} h`} />
          <SummaryStat label="Soll Woche" value={`${formatHours(week.sollHours)} h`} />
          <SummaryStat
            label="Differenz"
            value={formatSignedHours(week.diffHours)}
            emphasize={diffTone}
          />
        </div>
        <div className="card grid grid-cols-3 gap-4 p-4">
          <SummaryStat
            label={`Ist ${week.monthLabel}`}
            value={`${formatHours(week.monthIst)} h`}
          />
          <SummaryStat
            label="Soll Monat"
            value={`${formatHours(week.monthSoll)} h`}
          />
          <SummaryStat
            label="Saldo Monat"
            value={formatSignedHours(week.monthDiff)}
            emphasize={monthTone}
          />
        </div>
      </div>

      {(week.sickDays > 0 || week.vacationDays > 0) && (
        <p className="text-sm text-[var(--muted)]">
          Diese Woche: {week.sickDays > 0 ? `${week.sickDays}× Krank` : null}
          {week.sickDays > 0 && week.vacationDays > 0 ? " · " : null}
          {week.vacationDays > 0 ? `${week.vacationDays}× Ferien` : null}
        </p>
      )}

      <ul className="card divide-y divide-[var(--border)] overflow-hidden">
        {week.days.map((day) => {
          const open = openKey === day.dateKey;
          const segmentLabel = formatSegmentsSummary(
            day.entry?.segments ?? [],
          );
          const status =
            day.entry?.type && day.entry.type !== "work"
              ? TIME_ENTRY_TYPE_LABELS[day.entry.type]
              : day.holidayName && !day.entry
                ? day.holidayName
                : segmentLabel
                  ? segmentLabel
                  : day.isWeekend
                    ? "Wochenende"
                    : "Offen";

          return (
            <li
              key={day.dateKey}
              className={
                day.isToday
                  ? "bg-[var(--accent-soft)]/40"
                  : day.isWeekend
                    ? "bg-[var(--bg)]/50"
                    : undefined
              }
            >
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                onClick={() => setOpenKey(open ? null : day.dateKey)}
              >
                <div>
                  <p className="font-semibold">
                    <span className="inline-block w-10 text-[var(--muted)]">
                      {day.weekdayLabel}
                    </span>
                    {day.dateLabel}
                    {day.isToday && (
                      <span className="ml-2 rounded-full bg-[var(--highlight)] px-2 py-0.5 text-[0.65rem] font-extrabold uppercase">
                        Heute
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-sm text-[var(--muted)]">
                    {status}
                    {day.entry?.note ? ` · ${day.entry.note}` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold tabular-nums">
                    {day.workedHours > 0
                      ? `${formatHours(day.workedHours)} h`
                      : day.entry?.type === "sick" ||
                          day.entry?.type === "vacation" ||
                          day.entry?.type === "holiday"
                        ? TIME_ENTRY_TYPE_LABELS[day.entry.type]
                        : "—"}
                  </p>
                  {day.baseSollHours > 0 && (
                    <p className="text-xs text-[var(--muted)]">
                      Soll {formatHours(day.sollHours)} h
                    </p>
                  )}
                </div>
              </button>
              {open && (
                <div className="px-4 pb-4">
                  {readOnly ? (
                    <div className="mt-1 rounded-xl border border-[var(--border)] bg-[var(--bg)]/60 px-3 py-2 text-sm text-[var(--muted)]">
                      {day.entry ? (
                        <>
                          <p>
                            {TIME_ENTRY_TYPE_LABELS[day.entry.type]}
                            {day.entry.type === "work" && segmentLabel
                              ? ` · ${segmentLabel}`
                              : ""}
                          </p>
                          {day.entry.type === "work" && (
                            <p className="mt-1">
                              Arbeit:{" "}
                              {formatHours(
                                computeWorkedHours(
                                  day.entry.segments,
                                  day.entry.breakMinutes,
                                ),
                              )}{" "}
                              h · Pause: {day.entry.breakMinutes} Min.
                            </p>
                          )}
                          {day.entry.note && (
                            <p className="mt-1">{day.entry.note}</p>
                          )}
                        </>
                      ) : (
                        <p>Kein Eintrag.</p>
                      )}
                    </div>
                  ) : (
                    <DayEditor
                      day={day}
                      dailyTarget={week.dailyTarget}
                      onDone={() => {
                        router.refresh();
                      }}
                    />
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
