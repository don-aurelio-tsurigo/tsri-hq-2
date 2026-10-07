import Link from "next/link";
import { notFound } from "next/navigation";
import { FinanceDealEditor } from "@/components/finance-deal-editor";
import { listCompanyOptions } from "@/lib/finance/companies";
import { getDealDetail, listCategoryOptions } from "@/lib/finance/deals";
import { pageTitle } from "@/lib/link-preview";
import { requireCapability } from "@/lib/session";

export const metadata = pageTitle("Finance");

export default async function FinanceDealPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { membership } = await requireCapability("finance");
  const [deal, categories, companies] = await Promise.all([
    getDealDetail(membership.organizationId, id),
    listCategoryOptions(membership.organizationId),
    listCompanyOptions(membership.organizationId),
  ]);
  if (!deal) notFound();

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Link
          href="/finance/deals"
          className="text-sm font-semibold text-[var(--accent)] hover:underline"
        >
          ← Alle Deals
        </Link>
        <header className="mt-3">
          <p className="text-sm font-semibold tracking-wide text-[var(--accent)] uppercase">
            Finance · Deal
          </p>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
            {deal.title}
          </h1>
        </header>
      </div>
      {/* Remount after each save so rows pick up the new booking ids */}
      <FinanceDealEditor
        key={deal.updatedAt}
        deal={deal}
        categories={categories}
        companies={companies}
      />
    </div>
  );
}
