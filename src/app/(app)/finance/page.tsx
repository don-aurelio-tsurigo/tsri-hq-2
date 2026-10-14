import { FinanceBudgetOverview } from "@/components/finance-budget-overview";
import { FinanceSectionTabs } from "@/components/finance-section-tabs";
import { getBudgetOverview } from "@/lib/finance/budget";
import { listCompanyOptions } from "@/lib/finance/companies";
import { pageTitle } from "@/lib/link-preview";
import { requireCapability } from "@/lib/session";

export const metadata = pageTitle("Finance");

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ jahr?: string }>;
}) {
  const { membership } = await requireCapability("finance");
  const { jahr } = await searchParams;
  const parsed = Number(jahr);
  const year =
    Number.isInteger(parsed) && parsed >= 2000 && parsed <= 2100
      ? parsed
      : new Date().getFullYear();

  const [overview, companies] = await Promise.all([
    getBudgetOverview(membership.organizationId, year),
    listCompanyOptions(membership.organizationId),
  ]);

  return (
    <div className="space-y-3">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1 border-b-2 border-[var(--border)]">
        <h1 className="pb-1.5 font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">
          <span className="text-[var(--accent)]">Finance</span> · Budget {year}
        </h1>
        <FinanceSectionTabs section="budget" active="overview" bare />
      </header>
      <FinanceBudgetOverview overview={overview} companies={companies} />
    </div>
  );
}
