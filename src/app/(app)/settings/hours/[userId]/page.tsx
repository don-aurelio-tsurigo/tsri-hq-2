import Link from "next/link";
import { notFound } from "next/navigation";
import { addDays, format, parseISO, startOfWeek } from "date-fns";
import { de } from "date-fns/locale";
import { TimeTrackingWeek } from "@/components/time-tracking-week";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import {
  dailyTargetHours,
  formatHours,
  toTimeDateKey,
} from "@/lib/time-tracking-constants";
import {
  getMonthTimeSummary,
  getWeekTimeSummary,
  getYearToDateTimeSummary,
  weekLabel,
} from "@/lib/time-tracking";

function parseWeekParam(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return startOfWeek(new Date(), { weekStartsOn: 1 });
  }
  try {
    return startOfWeek(parseISO(value), { weekStartsOn: 1 });
  } catch {
    return startOfWeek(new Date(), { weekStartsOn: 1 });
  }
}

function signed(hours: number) {
  const sign = hours > 0 ? "+" : "";
  return `${sign}${formatHours(hours)} h`;
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

  const [week, month, year] = await Promise.all([
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
    getYearToDateTimeSummary(
      membership.organizationId,
      userId,
      pensum,
    ),
  ]);

  const todayKey = toTimeDateKey(new Date());
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
            breakMinutes: d.entry.breakMinutes,
            segments: d.entry.segments.map((s) => ({
              startTime: s.startTime,
              endTime: s.endTime,
            })),
          }
        : null,
      isToday: d.dateKey === todayKey,
    })),
  };

  const yearTone =
    year.diffHours > 0.01
      ? "text-emerald-700"
      : year.diffHours < -0.01
        ? "text-[var(--danger)]"
        : "";

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
        <div className="card mt-4 grid grid-cols-3 gap-4 p-4">
          <div>
            <p className="text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">
              Ist Jahr
            </p>
            <p className="mt-1 font-[family-name:var(--font-display)] text-2xl font-semibold tabular-nums">
              {formatHours(year.istHours)} h
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">
              Soll Jahr
            </p>
            <p className="mt-1 font-[family-name:var(--font-display)] text-2xl font-semibold tabular-nums">
              {formatHours(year.sollHours)} h
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">
              Saldo Jahr
            </p>
            <p
              className={`mt-1 font-[family-name:var(--font-display)] text-2xl font-semibold tabular-nums ${yearTone}`}
            >
              {signed(year.diffHours)}
            </p>
          </div>
        </div>
      </header>

      <TimeTrackingWeek
        week={weekData}
        readOnly
        weekBasePath={basePath}
      />
    </div>
  );
}
