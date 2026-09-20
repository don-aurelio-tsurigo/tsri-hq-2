import { EditorialYearCalendar } from "@/components/editorial-year-calendar";
import { pageTitle } from "@/lib/link-preview";
import { listYearCalendar } from "@/lib/editorial-calendar";
import {
  monthKeyFromParts,
  parseMonthKey,
  parseViewParam,
  parseYearParam,
  startOfIsoWeek,
} from "@/lib/editorial-calendar-shared";
import { requireMembership } from "@/lib/session";
import { format } from "date-fns";

export const metadata = pageTitle("Jahreskalender");

export default async function JahreskalenderPage({
  searchParams,
}: {
  searchParams: Promise<{
    year?: string;
    view?: string;
    month?: string;
    week?: string;
  }>;
}) {
  const { membership } = await requireMembership();
  const params = await searchParams;
  const view = parseViewParam(params.view);
  const today = new Date();

  let year: number;
  let monthKey: string;
  let weekStartKey: string;

  if (view === "week" && params.week) {
    const parsed = parseDateOrNull(params.week);
    const start = startOfIsoWeek(parsed ?? today);
    weekStartKey = format(start, "yyyy-MM-dd");
    monthKey = format(start, "yyyy-MM");
    year = start.getFullYear();
  } else if (params.month) {
    const m = parseMonthKey(params.month);
    if (m) {
      year = m.year;
      monthKey = monthKeyFromParts(m.year, m.month);
      weekStartKey = format(
        startOfIsoWeek(new Date(m.year, m.month - 1, 1)),
        "yyyy-MM-dd",
      );
    } else {
      year = today.getFullYear();
      monthKey = format(today, "yyyy-MM");
      weekStartKey = format(startOfIsoWeek(today), "yyyy-MM-dd");
    }
  } else if (params.year) {
    year = parseYearParam(params.year);
    const sameYearToday =
      today.getFullYear() === year ? today : new Date(year, 0, 1);
    monthKey = format(sameYearToday, "yyyy-MM");
    weekStartKey = format(startOfIsoWeek(sameYearToday), "yyyy-MM-dd");
  } else {
    year = today.getFullYear();
    monthKey = format(today, "yyyy-MM");
    weekStartKey = format(startOfIsoWeek(today), "yyyy-MM-dd");
  }

  // Prefer explicit year when in year view
  if (view === "year" && params.year) {
    year = parseYearParam(params.year);
  }

  const data = await listYearCalendar(membership.organizationId, year);

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          <p className="text-xs font-semibold tracking-wide text-[var(--accent)] uppercase">
            Redaktion
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">
            Jahreskalender
          </h1>
        </div>
        <p className="max-w-md text-xs text-[var(--muted)]">
          Events und Story-Anker vorplanen — inkl. wiederkehrender Termine und
          offener Daten zum Einplanen.
        </p>
      </header>

      <EditorialYearCalendar
        year={year}
        view={view}
        monthKey={monthKey}
        weekStartKey={weekStartKey}
        occurrences={data.occurrences.map((o) => ({
          eventId: o.eventId,
          dateKey: o.dateKey,
          title: o.title,
          note: o.note,
          frequency: o.frequency,
          dateMode: o.dateMode,
          category: o.category,
        }))}
        pending={data.pending}
        events={data.events}
        categories={data.categories}
      />
    </div>
  );
}

function parseDateOrNull(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}
