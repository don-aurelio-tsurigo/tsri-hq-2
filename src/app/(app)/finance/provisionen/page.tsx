import Link from "next/link";
import { ChevronLeft, ChevronRight, Lock } from "lucide-react";
import { FinanceCommissionPeriodActions } from "@/components/finance-commission-period-actions";
import { FinanceCommissionStatement } from "@/components/finance-commission-statement";
import { FinanceSectionTabs } from "@/components/finance-section-tabs";
import { commissionPeriodOf, commissionPeriodRangeLabel } from "@/lib/finance/commission";
import { getCommissionPeriodOverview } from "@/lib/finance/commission-store";
import { addMonths, formatChfExact, isMonthKey, monthLabel } from "@/lib/finance/shared";
import { pageTitle } from "@/lib/link-preview";
import { requireCapability } from "@/lib/session";

export const metadata = pageTitle("Finance");

export default async function FinanceCommissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ periode?: string }>;
}) {
  const { membership } = await requireCapability("finance");
  const params = await searchParams;
  const current = commissionPeriodOf(new Date());
  const period = params.periode && isMonthKey(params.periode) ? params.periode : current;
  const overview = await getCommissionPeriodOverview(membership.organizationId, period);
  const href = (p: string) => `/finance/provisionen?periode=${p}`;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <p className="text-sm font-semibold tracking-wide text-[var(--accent)] uppercase">Finance</p>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
          Provisionen
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-[var(--muted)]">
          Abrechnung pro Periode (21. bis 20.) und Sales-Person. Massgeblich ist das Verkaufsdatum
          des Deals. Offene Perioden werden live berechnet, abgeschlossene sind eingefroren.
        </p>
      </header>
      <FinanceSectionTabs section="commissions" active="overview" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href={href(addMonths(period, -1))} className="btn btn-ghost px-2" aria-label="Vorherige Periode">
            <ChevronLeft className="size-4" />
          </Link>
          <div className="min-w-48 text-center">
            <p className="font-semibold">{monthLabel(period)}</p>
            <p className="text-xs text-[var(--muted)]">{commissionPeriodRangeLabel(period)}</p>
          </div>
          <Link href={href(addMonths(period, 1))} className="btn btn-ghost px-2" aria-label="Nächste Periode">
            <ChevronRight className="size-4" />
          </Link>
          {period !== current ? (
            <Link href={href(current)} className="text-sm font-semibold text-[var(--accent)] hover:underline">
              Aktuelle Periode
            </Link>
          ) : null}
        </div>
        <FinanceCommissionPeriodActions
          period={period}
          closed={overview.closed !== null}
          canClose={overview.closeBlockers.length === 0}
        />
      </div>

      {overview.closed ? (
        <p className="flex items-center gap-1.5 text-sm text-[var(--muted)]">
          <Lock className="size-3.5" />
          Abgeschlossen am {new Date(overview.closed.closedAt).toLocaleDateString("de-CH")} – Beträge
          eingefroren, Deals gesperrt.
        </p>
      ) : overview.closeBlockers.length ? (
        <ul className="space-y-1 text-sm text-[var(--muted)]">
          {overview.closeBlockers.map((b) => (
            <li key={b}>Noch nicht abschliessbar: {b}</li>
          ))}
        </ul>
      ) : null}

      {overview.undecidedCount > 0 && !overview.closed ? (
        <div className="card border-amber-400 bg-amber-50 p-4 text-sm">
          {overview.undecidedCount} {overview.undecidedCount === 1 ? "Deal hat" : "Deals haben"} noch
          keinen Provisions-Entscheid – sie fehlen in der Abrechnung, bis sie zugeordnet sind.{" "}
          <Link href="/finance/deals?status=commission" className="font-semibold underline">
            Jetzt prüfen
          </Link>
        </div>
      ) : null}

      {overview.rows.length === 0 ? (
        <div className="card p-8 text-center text-sm text-[var(--muted)]">
          Keine Provisionen in dieser Periode. Sales-Personen erscheinen hier, sobald sie unter{" "}
          <Link href="/finance/provisionen/modelle" className="font-semibold text-[var(--accent)] hover:underline">
            Modelle & Zuweisungen
          </Link>{" "}
          ein Modell haben oder ihnen ein Deal zugewiesen ist.
        </div>
      ) : (
        <div className="space-y-3">
          {overview.rows.map((row) => (
            <FinanceCommissionStatement key={row.user.id} row={row} linkDeals />
          ))}
          <div className="flex justify-end gap-6 px-4 text-sm">
            <span className="text-[var(--muted)]">Total Provisionen</span>
            <span className="min-w-28 text-right font-semibold tabular-nums">
              {formatChfExact(overview.total)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
