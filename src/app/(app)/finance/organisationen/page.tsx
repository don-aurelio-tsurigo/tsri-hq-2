import Link from "next/link";
import { FinanceSectionTabs } from "@/components/finance-section-tabs";
import { FinanceCompanyDuplicates } from "@/components/finance-company-duplicates";
import { findLikelyDuplicates, listAdminCompanies } from "@/lib/finance/companies";
import { formatChf } from "@/lib/finance/shared";
import { pageTitle } from "@/lib/link-preview";
import { requireCapability } from "@/lib/session";

export const metadata = pageTitle("Finance");

export default async function FinanceCompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { membership } = await requireCapability("finance");
  const { q = "" } = await searchParams;
  const all = await listAdminCompanies(membership.organizationId);
  const query = q.trim().toLowerCase();
  const companies = query ? all.filter((c) => c.name.toLowerCase().includes(query)) : all;
  const duplicates = findLikelyDuplicates(all);

  const current = new Date().getFullYear();
  const years = [current - 1, current, current + 1];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold tracking-wide text-[var(--accent)] uppercase">Finance</p>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
            Organisationen
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {all.length} Organisationen. Neue entstehen automatisch über Zapier oder beim Erfassen
            eines Deals bzw. einer Buchung.
          </p>
        </div>
        <form action="/finance/organisationen">
          <input
            name="q"
            defaultValue={q}
            placeholder="Suchen"
            aria-label="Organisationen durchsuchen"
            className="w-64 rounded-lg border-2 border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-sm"
          />
        </form>
      </header>
      <FinanceSectionTabs section="deals" active="companies" />

      {duplicates.length > 0 && !query ? <FinanceCompanyDuplicates groups={duplicates} /> : null}

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[44rem] text-left text-sm">
          <thead>
            <tr className="border-b-2 border-[var(--border)] text-[var(--muted)]">
              <th className="px-4 py-3 font-semibold">Organisation</th>
              <th className="px-4 py-3 text-right font-semibold">Deals</th>
              {years.map((y) => (
                <th key={y} className="px-4 py-3 text-right font-semibold">
                  Effektiv {y}
                </th>
              ))}
              <th className="px-4 py-3 font-semibold">Pipedrive</th>
            </tr>
          </thead>
          <tbody>
            {companies.length === 0 ? (
              <tr>
                <td colSpan={years.length + 3} className="px-4 py-8 text-center text-[var(--muted)]">
                  Keine Organisation gefunden.
                </td>
              </tr>
            ) : (
              companies.map((c) => (
                <tr key={c.id} className="border-b border-[var(--border)]/60 last:border-0 hover:bg-[#f6f6f6]">
                  <td className="px-4 py-2.5">
                    <Link href={`/finance/organisationen/${c.id}`} className="font-semibold hover:underline">
                      {c.name}
                    </Link>
                    {c.notes ? (
                      <p className="max-w-md truncate text-xs text-[var(--muted)]">{c.notes}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{c.dealCount || "–"}</td>
                  {years.map((y) => (
                    <td key={y} className="px-4 py-2.5 text-right tabular-nums">
                      {c.totals[y] ? formatChf(c.totals[y]) : <span className="text-[var(--border)]">–</span>}
                    </td>
                  ))}
                  <td className="px-4 py-2.5 text-xs text-[var(--muted)]">
                    {c.pipedriveId ? `#${c.pipedriveId}` : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
