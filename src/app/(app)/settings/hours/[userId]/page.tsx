import Link from "next/link";
import { notFound } from "next/navigation";
import { addDays, format, parseISO, startOfWeek } from "date-fns";
import { de } from "date-fns/locale";
import { TimeTrackingWeek } from "@/components/time-tracking-week";
import { prisma } from "@/lib/db";
import { pageTitle } from "@/lib/link-preview";
import { requireAdmin } from "@/lib/session";
import {
  dailyTargetHours,
  formatHours,
  todayInZurich,
  toTimeDateKey,
} from "@/lib/time-tracking-constants";
import {
  getMonthlyBalances,
  getMonthTimeSummary,
  getWeekTimeSummary,
  weekLabel,
} from "@/lib/time-tracking";

export const metadata = pageTitle("Teamarbeitszeit");

function parseWeekParam(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return startOfWeek(todayInZurich(), { weekStartsOn: 1 });
  }
  try {
    return startOfWeek(parseISO(value), { weekStartsOn: 1 });
  } catch {
    return startOfWeek(todayInZurich(), { weekStartsOn: 1 });
  }
}

function signed(hours: number) {
  const sign = hours > 0 ? "+" : "";
  return `${sign}${formatHours(hours)} h`;
}

function saldoTone(hours: number) {
  if (hours > 0.01) return "text-emerald-700";
  if (hours < -0.01) return "text-[var(--danger)]";
  return "";
}

export default async function AdminMemberHoursPage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ week?: string }>;
}) {
  const { membership } = await requireAdmin();
  const { userId } = await params;
  const { week: weekParam } = await searchParams;

  const target = await prisma.membership.findUnique({
    where: {
      organizationId_userId: {
        organizationId: membership.organizationId,
        userId,
      },
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
  });
  if (!target) notFound();

  const weekStart = parseWeekParam(weekParam);
  const pensum = target.pensumPercent;

  const [week, month, balances] = await Promise.all([
    getWeekTimeSummary(
      membership.organizationId,
      userId,
      pensum,
      weekStart,
    ),
    getMonthTimeSummary(
      membership.organizationId,
      userId,
      pensum,
      weekStart,
    ),
    getMonthlyBalances(membership.organizationId, userId, pensum),
  ]);

  const todayKey = toTimeDateKey(todayInZurich());
  const basePath = `/settings/hours/${userId}`;

  const weekData = {
    startKey: toTimeDateKey(week.start),
    endKey: toTimeDateKey(week.end),
    weekLabel: weekLabel(week.start, week.end),
    prevWeek: toTimeDateKey(addDays(week.start, -7)),
    nextWeek: toTimeDateKey(addDays(week.start, 7)),
    pensumPercent: pensum,
    dailyTarget: dailyTargetHours(pensum),
    sollHours: week.sollHours,
    istHours: week.istHours,
    diffHours: week.diffHours,
    monthSoll: month.sollHours,
    monthIst: month.istHours,
    monthDiff: month.diffHours,
    monthLabel: format(week.start, "MMMM", { locale: de }),
    monthIsRunning:
      toTimeDateKey(month.start) <= todayKey &&
      todayKey <= toTimeDateKey(month.end),
    sickDays: week.sickDays,
    vacationDays: week.vacationDays,
    days: week.days.map((d) => ({
      dateKey: d.dateKey,
      dateLabel: format(d.date, "d. MMMM", { locale: de }),
      weekdayLabel: d.weekdayLabel,
      isWeekend: d.isWeekend,
      holidayName: d.holidayName,
      baseSollHours: d.baseSollHours,
      sollHours: d.sollHours,
      workedHours: d.workedHours,
      entry: d.entry
        ? {
            id: d.entry.id,
            type: d.entry.type,
            note: d.entry.note,
            segments: d.entry.segments.map((s) => ({
              type: s.type,
              startTime: s.startTime,
              endTime: s.endTime,
            })),
          }
        : null,
      isToday: d.dateKey === todayKey,
    })),
  };

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header>
        <p className="text-sm font-semibold tracking-wide text-[var(--accent)] uppercase">
          Admin · Arbeitszeit
        </p>
        <div className="mt-1 flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
            {target.user.name}
          </h1>
          <Link
            href="/settings/hours"
            className="text-sm font-semibold text-[var(--accent)] hover:underline"
          >
            ← Team-Übersicht
          </Link>
        </div>
        <p className="mt-2 text-[var(--muted)]">
          {target.user.email} · Pensum {pensum}% · nur Einsicht
        </p>
      </header>

      <TimeTrackingWeek
        week={weekData}
        readOnly
        weekBasePath={basePath}
      />

      <section className="space-y-3">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">
            Monatssaldi
          </h2>
          <p className="text-sm text-[var(--muted)]">
            Letzte 12 Monate. Überstunden werden nur innerhalb eines Monats
            kompensiert — kein Übertrag.
          </p>
        </div>
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-xs tracking-wide text-[var(--muted)] uppercase">
                <th className="px-4 py-3 font-semibold">Monat</th>
                <th className="px-3 py-3 text-right font-semibold">Ist</th>
                <th className="px-3 py-3 text-right font-semibold">Soll</th>
                <th className="px-3 py-3 text-right font-semibold">Saldo</th>
                <th className="px-4 py-3 font-semibold">Abwesend</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {balances.map((m) => (
                <tr key={m.monthKey}>
                  <td className="px-4 py-3 font-semibold">
                    {m.label}
                    {m.isRunning && (
                      <span className="ml-2 rounded-full bg-[var(--highlight)] px-2 py-0.5 text-[0.65rem] font-extrabold uppercase">
                        Bis heute
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {formatHours(m.istHours)} h
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-[var(--muted)]">
                    {formatHours(m.sollHours)} h
                  </td>
                  <td
                    className={`px-3 py-3 text-right font-bold tabular-nums ${saldoTone(m.diffHours)}`}
                  >
                    {signed(m.diffHours)}
                  </td>
                  <td className="px-4 py-3 text-[var(--muted)]">
                    {[
                      m.sickDays > 0 ? `${m.sickDays}× Krank` : null,
                      m.vacationDays > 0 ? `${m.vacationDays}× Ferien` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
