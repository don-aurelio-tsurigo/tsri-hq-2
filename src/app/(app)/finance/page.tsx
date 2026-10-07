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
    <div className="space-y-6">
      <header>
        <p className="text-sm font-semibold tracking-wide text-[var(--accent)] uppercase">
          Finance
        </p>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
          Budget {year}
        </h1>
      </header>
      <FinanceSectionTabs section="budget" active="overview" />
      <FinanceBudgetOverview overview={overview} companies={companies} />
    </div>
  );
}
