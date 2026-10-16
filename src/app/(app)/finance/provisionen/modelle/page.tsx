import {
  FinanceCommissionAssignments,
  FinanceCommissionModels,
} from "@/components/finance-commission-models";
import { FinanceSectionTabs } from "@/components/finance-section-tabs";
import {
  listCommissionAssignments,
  listCommissionModels,
  listSalesPeople,
} from "@/lib/finance/commission-store";
import { pageTitle } from "@/lib/link-preview";
import { requireCapability } from "@/lib/session";

export const metadata = pageTitle("Finance");

export default async function FinanceCommissionModelsPage() {
  const { membership } = await requireCapability("finance");
  const organizationId = membership.organizationId;
  const [models, assignments, salesPeople] = await Promise.all([
    listCommissionModels(organizationId),
    listCommissionAssignments(organizationId),
    listSalesPeople(organizationId),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <p className="text-sm font-semibold tracking-wide text-[var(--accent)] uppercase">Finance</p>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
          Provisionen
        </h1>
      </header>
      <FinanceSectionTabs section="commissions" active="models" />
      <FinanceCommissionModels models={models} />
      <FinanceCommissionAssignments assignments={assignments} models={models} salesPeople={salesPeople} />
    </div>
  );
}
