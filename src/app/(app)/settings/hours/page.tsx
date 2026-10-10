import Link from "next/link";
import { addMonths, format } from "date-fns";
import { de } from "date-fns/locale";
import { pageTitle } from "@/lib/link-preview";
import { requireAdmin } from "@/lib/session";
import { listTeamHoursOverview } from "@/lib/time-tracking";
import { formatHours, todayInZurich } from "@/lib/time-tracking-constants";

export const metadata = pageTitle("Teamarbeitszeit");

function signed(hours: number) {
  const sign = hours > 0 ? "+" : "";
  return `${sign}${formatHours(hours)} h`;
}

function saldoClass(hours: number) {
  if (hours > 0.01) return "font-bold tabular-nums text-emerald-700";
  if (hours < -0.01) return "font-bold tabular-nums text-[var(--danger)]";
  return "font-bold tabular-nums";
}

export default async function AdminHoursPage() {
  const { membership } = await requireAdmin();
  const rows = await listTeamHoursOverview(membership.organizationId);
  const today = todayInZurich();
  const monthLabel = format(today, "MMMM", { locale: de });
  const prevMonthLabel = format(addMonths(today, -1), "MMMM", { locale: de });

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm font-semibold tracking-wide text-[var(--accent)] uppercase">
          Admin
        </p>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
          Arbeitszeit Team
        </h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Überstunden werden nur innerhalb eines Monats kompensiert — der Saldo
          verfällt Ende Monat, es gibt keinen Übertrag.
        </p>
      </header>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-xs tracking-wide text-[var(--muted)] uppercase">
              <th className="px-4 py-3 font-semibold">Person</th>
              <th className="px-3 py-3 font-semibold">Pensum</th>
              <th className="px-3 py-3 font-semibold">Woche</th>
              <th className="px-3 py-3 font-semibold">
                {monthLabel} <span className="font-normal normal-case">(bis heute)</span>
              </th>
              <th className="px-3 py-3 font-semibold">
                {prevMonthLabel} <span className="font-normal normal-case">(Abschluss)</span>
              </th>
              <th className="px-4 py-3 font-semibold" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {rows.map((row) => (
              <tr
                key={row.userId}
                className={
                  row.archived
                    ? "bg-[var(--bg)]/40 hover:bg-black/[0.02]"
                    : "hover:bg-black/[0.02]"
                }
              >
                <td className="px-4 py-3">
                  <p className="font-semibold">
                    {row.name}
                    {row.archived && (
                      <span className="ml-2 rounded-full border border-[var(--border)] px-2 py-0.5 text-[0.65rem] font-extrabold tracking-wide text-[var(--muted)] uppercase">
                        Archiviert
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-[var(--muted)]">{row.email}</p>
                </td>
                <td className="px-3 py-3 tabular-nums text-[var(--muted)]">
                  {row.pensumPercent}%
                </td>
                <td className="px-3 py-3">
                  <p className={saldoClass(row.week.diffHours)}>
                    {signed(row.week.diffHours)}
                  </p>
                  <p className="text-xs text-[var(--muted)]">
                    {formatHours(row.week.istHours)} /{" "}
                    {formatHours(row.week.sollHours)} h
                  </p>
                </td>
                <td className="px-3 py-3">
                  <p className={saldoClass(row.month.diffHours)}>
                    {signed(row.month.diffHours)}
                  </p>
                  <p className="text-xs text-[var(--muted)]">
                    {formatHours(row.month.istHours)} /{" "}
                    {formatHours(row.month.sollHours)} h
                  </p>
                </td>
                <td className="px-3 py-3">
                  <p className={saldoClass(row.prevMonth.diffHours)}>
                    {signed(row.prevMonth.diffHours)}
                  </p>
                  <p className="text-xs text-[var(--muted)]">
                    {formatHours(row.prevMonth.istHours)} /{" "}
                    {formatHours(row.prevMonth.sollHours)} h
                  </p>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/settings/hours/${row.userId}`}
                    className="text-sm font-semibold text-[var(--accent)] hover:underline"
                  >
                    Details
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="px-4 py-8 text-sm text-[var(--muted)]">
            Keine Teammitglieder.
          </p>
        )}
      </div>
    </div>
  );
}
