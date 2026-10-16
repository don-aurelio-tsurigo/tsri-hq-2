import Link from "next/link";
import type { CommissionPersonRow } from "@/lib/finance/commission-store";
import { formatChfExact } from "@/lib/finance/shared";

export function formatRate(rate: number): string {
  return `${(Math.round(rate * 1000) / 10).toLocaleString("de-CH")} %`;
}

/** One person's statement for a period: summary plus the deals behind it. */
export function FinanceCommissionStatement({
  row,
  linkDeals,
  defaultOpen = false,
}: {
  row: CommissionPersonRow;
  /** Link deal titles to the finance deal page (finance only) */
  linkDeals: boolean;
  defaultOpen?: boolean;
}) {
  const r = row.result;
  return (
    <details className="card group" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-6 gap-y-2 p-4">
        <div className="min-w-40 flex-1">
          <p className="font-semibold">{row.user.name}</p>
          <p className="text-xs text-[var(--muted)]">
            {row.model ? row.model.name : <span className="font-semibold text-[var(--danger)]">Kein Modell zugewiesen</span>}
            {" · "}
            {row.deals.length} {row.deals.length === 1 ? "Deal" : "Deals"}
          </p>
        </div>
        <Figure label="Intern" value={formatChfExact(r?.intern ?? sum(row, "intern"))} />
        <Figure label="Extern" value={formatChfExact(r?.extern ?? sum(row, "extern"))} />
        <Figure label="Provision" value={r ? formatChfExact(r.amount) : "—"} strong />
      </summary>

      <div className="space-y-4 border-t-2 border-[var(--border)] px-4 py-4">
        {r && row.model ? (
          <dl className="grid grid-cols-[auto_auto] justify-start gap-x-6 gap-y-1 text-sm tabular-nums">
            <dt className="text-[var(--muted)]">Grundbetrag</dt>
            <dd className="text-right">{formatChfExact(r.base)}</dd>
            <dt className="text-[var(--muted)]">
              Intern {formatChfExact(r.intern)} × {formatRate(r.internRate)}
            </dt>
            <dd className="text-right">{formatChfExact(r.internPart)}</dd>
            <dt className="text-[var(--muted)]">
              Extern {formatChfExact(r.extern)} × {formatRate(row.model.params.externRate)}
            </dt>
            <dd className="text-right">{formatChfExact(r.externPart)}</dd>
            <dt className="font-semibold">Provision</dt>
            <dd className="text-right font-semibold">{formatChfExact(r.amount)}</dd>
          </dl>
        ) : null}

        {row.deals.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Keine Deals in dieser Periode.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead>
                <tr className="text-xs text-[var(--muted)]">
                  <th className="py-1.5 pr-3 font-semibold">Verkauft</th>
                  <th className="py-1.5 pr-3 font-semibold">Deal</th>
                  <th className="py-1.5 pr-3 text-right font-semibold">Intern</th>
                  <th className="py-1.5 text-right font-semibold">Extern</th>
                </tr>
              </thead>
              <tbody>
                {row.deals.map((d) => (
                  <tr key={d.id} className="border-t border-[var(--border)]/60">
                    <td className="py-1.5 pr-3 whitespace-nowrap tabular-nums">
                      {new Date(d.soldAt).toLocaleDateString("de-CH")}
                    </td>
                    <td className="py-1.5 pr-3">
                      {linkDeals ? (
                        <Link href={`/finance/deals/${d.id}`} className="font-semibold hover:underline">
                          {d.title}
                        </Link>
                      ) : (
                        <span className="font-semibold">{d.title}</span>
                      )}
                      {d.company ? <span className="text-[var(--muted)]"> · {d.company}</span> : null}
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{formatChfExact(d.intern)}</td>
                    <td className="py-1.5 text-right tabular-nums">{formatChfExact(d.extern)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </details>
  );
}

function sum(row: CommissionPersonRow, key: "intern" | "extern") {
  return row.deals.reduce((s, d) => s + d[key], 0);
}

function Figure({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="min-w-28 text-right">
      <p className="text-xs text-[var(--muted)]">{label}</p>
      <p className={["tabular-nums", strong ? "font-semibold" : ""].join(" ")}>{value}</p>
    </div>
  );
}
