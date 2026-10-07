import Link from "next/link";
import { notFound } from "next/navigation";
import { FinanceCompanyEditor } from "@/components/finance-company-editor";
import { FinanceDealStatusBadge } from "@/components/finance-deal-status-badge";
import { getCompanyDetail, listCompanyOptions } from "@/lib/finance/companies";
import { formatChfExact, monthLabel, parseMonthKey } from "@/lib/finance/shared";
import { pageTitle } from "@/lib/link-preview";
import { requireCapability } from "@/lib/session";

export const metadata = pageTitle("Finance");

export default async function FinanceCompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { membership } = await requireCapability("finance");
  const [company, options] = await Promise.all([
    getCompanyDetail(membership.organizationId, id),
    listCompanyOptions(membership.organizationId),
  ]);
  if (!company) notFound();

  const byYear = new Map<number, typeof company.bookings>();
  for (const b of company.bookings) {
    const [y] = parseMonthKey(b.month);
    byYear.set(y, [...(byYear.get(y) ?? []), b]);
  }
  const years = [...byYear.keys()].sort((a, b) => b - a);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Link href="/finance/organisationen" className="text-sm font-semibold text-[var(--accent)] hover:underline">
          ← Alle Organisationen
        </Link>
        <header className="mt-3">
          <p className="text-sm font-semibold tracking-wide text-[var(--accent)] uppercase">
            Finance · Organisation
          </p>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
            {company.name}
          </h1>
          {company.pipedriveId ? (
            <p className="mt-1 text-sm text-[var(--muted)]">Pipedrive #{company.pipedriveId}</p>
          ) : null}
        </header>
      </div>

      <FinanceCompanyEditor
        key={`${company.name}|${company.notes ?? ""}`}
        company={{ id: company.id, name: company.name, notes: company.notes }}
        others={options.filter((o) => o.id !== company.id)}
        canDelete={company.deals.length === 0 && company.bookings.length === 0}
      />

      <section className="card overflow-x-auto">
        <h2 className="border-b-2 border-[var(--border)] px-5 py-3 font-[family-name:var(--font-display)] text-lg font-semibold">
          Deals ({company.deals.length})
        </h2>
        {company.deals.length === 0 ? (
          <p className="px-5 py-4 text-sm text-[var(--muted)]">Keine Deals.</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {company.deals.map((d) => (
                <tr key={d.id} className="border-b border-[var(--border)]/60 last:border-0">
                  <td className="px-5 py-2.5">
                    <Link href={`/finance/deals/${d.id}`} className="font-semibold hover:underline">
                      {d.title}
                    </Link>
                  </td>
                  <td className="px-5 py-2.5 text-xs text-[var(--muted)]">
                    {d.bookingCount} {d.bookingCount === 1 ? "Buchung" : "Buchungen"}
                  </td>
                  <td className="px-5 py-2.5 text-right tabular-nums">{formatChfExact(d.totalAmount)}</td>
                  <td className="px-5 py-2.5 text-right">
                    <FinanceDealStatusBadge status={d.status} changed={d.changedAfterSplit} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {years.map((y) => {
        const list = byYear.get(y)!;
        const total = list.reduce((s, b) => s + b.amount, 0);
        return (
          <section key={y} className="card overflow-x-auto">
            <h2 className="flex items-center justify-between border-b-2 border-[var(--border)] px-5 py-3">
              <span className="font-[family-name:var(--font-display)] text-lg font-semibold">Buchungen {y}</span>
              <span className="font-semibold tabular-nums">{formatChfExact(total)}</span>
            </h2>
            <table className="w-full text-sm">
              <tbody>
                {list.map((b) => (
                  <tr key={b.id} className="border-b border-[var(--border)]/60 last:border-0">
                    <td className="px-5 py-2 whitespace-nowrap text-[var(--muted)]">{monthLabel(b.month)}</td>
                    <td className="px-5 py-2">
                      {b.dealId ? (
                        <Link href={`/finance/deals/${b.dealId}`} className="hover:underline">
                          {b.title}
                        </Link>
                      ) : (
                        b.title
                      )}
                    </td>
                    <td className="px-5 py-2 text-[var(--muted)]">{b.categoryName}</td>
                    <td className="px-5 py-2 text-right tabular-nums">{formatChfExact(b.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
    </div>
  );
}
