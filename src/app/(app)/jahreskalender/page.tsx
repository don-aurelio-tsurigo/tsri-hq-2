import { EditorialYearCalendar } from "@/components/editorial-year-calendar";
import { pageTitle } from "@/lib/link-preview";
import { listYearCalendar } from "@/lib/editorial-calendar";
import {
  formatMonthTitle,
  monthKeyFromParts,
  parseMonthKey,
} from "@/lib/editorial-calendar-shared";
import { requireMembership } from "@/lib/session";
import { addMonths, format } from "date-fns";

export const metadata = pageTitle("Jahreskalender");

export default async function JahreskalenderPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { membership } = await requireMembership();
  const { month: monthParam } = await searchParams;
  const today = new Date();

  const parsed = parseMonthKey(monthParam);
  const year = parsed?.year ?? today.getFullYear();
  const month = parsed?.month ?? today.getMonth() + 1;
  const monthKey = monthKeyFromParts(year, month);
  const monthAnchor = new Date(year, month - 1, 1);
  const prevMonth = format(addMonths(monthAnchor, -1), "yyyy-MM");
  const nextMonth = format(addMonths(monthAnchor, 1), "yyyy-MM");
  const currentMonth = format(today, "yyyy-MM");

  const data = await listYearCalendar(membership.organizationId, year);

  return (
    <div className="mx-auto max-w-6xl space-y-3">
      <header>
        <p className="text-xs font-semibold tracking-wide text-[var(--accent)] uppercase">
          Redaktion
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">
          Jahreskalender
        </h1>
      </header>

      <EditorialYearCalendar
        year={year}
        monthKey={monthKey}
        monthLabel={formatMonthTitle(year, month)}
        prevMonth={prevMonth}
        nextMonth={nextMonth}
        currentMonth={currentMonth}
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
