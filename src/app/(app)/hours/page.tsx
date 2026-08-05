import { addDays, format, parseISO, startOfWeek } from "date-fns";
import { de } from "date-fns/locale";
import { TimeTrackingWeek } from "@/components/time-tracking-week";
import { requireMembership } from "@/lib/session";
import {
  dailyTargetHours,
  formatHours,
  toTimeDateKey,
} from "@/lib/time-tracking-constants";
import {
  getMonthTimeSummary,
  getWeekTimeSummary,
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

export default async function HoursPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const { membership } = await requireMembership();
  const params = await searchParams;
  const weekStart = parseWeekParam(params.week);
  const pensum = membership.pensumPercent;

  const [week, month] = await Promise.all([
    getWeekTimeSummary(
      membership.organizationId,
      membership.userId,
      pensum,
      weekStart,
    ),
    getMonthTimeSummary(
      membership.organizationId,
      membership.userId,
      pensum,
      weekStart,
    ),
  ]);

  const todayKey = toTimeDateKey(new Date());
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
            segments: d.entry.segments.map((s) => ({
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
          Privat
        </p>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
          Arbeitszeit
        </h1>
        <p className="mt-2 text-[var(--muted)]">
          Beginn und Schluss pro Segment erfassen — Ist vs. Soll bei{" "}
          {pensum}% Pensum ({formatHours(dailyTargetHours(pensum))} h/Tag,
          40-h-Vollzeit).
        </p>
      </header>

      <TimeTrackingWeek week={weekData} />
    </div>
  );
}
