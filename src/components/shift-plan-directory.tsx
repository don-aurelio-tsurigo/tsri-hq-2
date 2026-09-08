"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  clearShiftSlot,
  confirmShiftPlanMonth,
  generateShiftPlanProposal,
  upsertShiftSlot,
} from "@/lib/actions";

type Member = { id: string; name: string };

type Slot = {
  dateKey: string;
  typeId: string;
  typeName: string;
  isEveningShift: boolean;
  campaign: {
    id: string;
    authorId: string | null;
    authorName: string | null;
    status: string;
    note: string | null;
  } | null;
};

type Day = {
  dateKey: string;
  weekdayLabel: string;
  slots: Slot[];
};

type TypeOption = { id: string; name: string };

export function ShiftPlanDirectory({
  types,
  initialTypeIds,
  members,
  canManage,
  calendar,
}: {
  types: TypeOption[];
  initialTypeIds: string[];
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
  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    initialTypeIds.length > 0 ? initialTypeIds : types.map((t) => t.id),
  );
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [flash, setFlash] = useState<string | null>(null);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  useEffect(() => {
    const typeIds = new Set(types.map((t) => t.id));
    setSelectedIds((prev) => {
      const next = prev.filter((id) => typeIds.has(id));
      if (next.length === 0) return types.map((t) => t.id);
      return next;
    });
  }, [types]);

  const [year, month] = calendar.monthKey.split("-").map(Number);

  const filteredDays = useMemo(
    () =>
      calendar.days
        .map((day) => ({
          ...day,
          slots: day.slots.filter((s) => selectedSet.has(s.typeId)),
        }))
        .filter((day) => day.slots.length > 0),
    [calendar.days, selectedSet],
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

  function syncUrl(nextIds: string[]) {
    const params = new URLSearchParams(window.location.search);
    params.delete("type");
    if (nextIds.length > 0 && nextIds.length < types.length) {
      for (const id of nextIds) params.append("type", id);
    }
    if (calendar.monthKey) params.set("month", calendar.monthKey);
    const qs = params.toString();
    router.replace(qs ? `/schichtplan?${qs}` : "/schichtplan", {
      scroll: false,
    });
  }

  function toggleType(typeId: string) {
    setSelectedIds((prev) => {
      const has = prev.includes(typeId);
      const next = has
        ? prev.filter((id) => id !== typeId)
        : [...prev, typeId];
      syncUrl(next);
      return next.length === 0 ? types.map((t) => t.id) : next;
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

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Link
            href={`/schichtplan?month=${calendar.prevMonth}`}
            className="btn btn-ghost px-2 py-1 text-sm"
          >
            ←
          </Link>
          <h2 className="min-w-[9rem] text-center font-[family-name:var(--font-display)] text-lg font-semibold capitalize">
            {calendar.monthLabel}
          </h2>
          <Link
            href={`/schichtplan?month=${calendar.nextMonth}`}
            className="btn btn-ghost px-2 py-1 text-sm"
          >
            →
          </Link>
        </div>

        {canManage && (
          <div className="flex flex-wrap gap-1.5">
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

      <div className="flex flex-wrap gap-1">
        {types.map((t) => {
          const active = selectedSet.has(t.id);
          return (
            <button
              key={t.id}
              type="button"
              className={
                active
                  ? "rounded-full border border-[var(--accent)] bg-[var(--accent)]/10 px-2 py-0.5 text-xs"
                  : "rounded-full border border-[var(--border)] px-2 py-0.5 text-xs text-[var(--muted)]"
              }
              onClick={() => toggleType(t.id)}
            >
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
          <p className="font-medium">Hinweise vom Solver</p>
          <ul className="mt-0.5 list-disc pl-4">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]">
        {filteredDays.map((day, dayIndex) => (
          <section
            key={day.dateKey}
            className={
              dayIndex > 0 ? "border-t border-[var(--border)]" : undefined
            }
          >
            <header className="bg-black/[0.03] px-3 py-1 text-xs font-semibold tracking-wide text-[var(--muted)]">
              {day.weekdayLabel} · {day.dateKey}
            </header>
            <ul className="divide-y divide-[var(--border)]">
              {day.slots.map((slot) => {
                const proposed = slot.campaign?.status === "proposed";
                const skipped = slot.campaign?.status === "skipped";
                return (
                  <li
                    key={`${slot.typeId}:${slot.dateKey}`}
                    className={[
                      "flex items-center gap-2 px-3 py-1",
                      proposed
                        ? "border-l-2 border-amber-400 bg-amber-50/50"
                        : skipped
                          ? "opacity-55"
                          : "",
                    ].join(" ")}
                  >
                    <div className="min-w-0 w-36 shrink-0 sm:w-44">
                      <p className="truncate text-sm leading-tight">
                        {slot.typeName}
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
                      className="input h-7 min-w-0 grow py-0 text-sm sm:max-w-xs"
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
                      <span className="w-10 shrink-0" aria-hidden />
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        {filteredDays.length === 0 && (
          <p className="px-3 py-4 text-sm text-[var(--muted)]">
            Keine Schichten in diesem Monat für die gewählten Typen. Für
            Gemeinderat zuerst Sitzungstermine unter Einstellungen erfassen.
          </p>
        )}
      </div>
    </div>
  );
}
