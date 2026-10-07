import { FinanceCategoryManager } from "@/components/finance-category-manager";
import { FinanceSectionTabs } from "@/components/finance-section-tabs";
import { availableYears } from "@/lib/finance/budget";
import { listAdminCategories } from "@/lib/finance/categories";
import { pageTitle } from "@/lib/link-preview";
import { requireCapability } from "@/lib/session";

export const metadata = pageTitle("Finance");

export default async function FinanceCategoriesPage() {
  const { membership } = await requireCapability("finance");
  const [categories, dataYears] = await Promise.all([
    listAdminCategories(membership.organizationId),
    availableYears(membership.organizationId),
  ]);
  // Data years plus a few years ahead, so a category can be planned for later
  const current = new Date().getFullYear();
  const years = [...new Set([...dataYears, current, current + 1, current + 2, current + 3])].sort(
    (a, b) => a - b,
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <p className="text-sm font-semibold tracking-wide text-[var(--accent)] uppercase">Finance</p>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
          Kategorien
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-[var(--muted)]">
          «Gültig ab/bis» steuert, in welchen Jahren eine Kategorie in der Übersicht und in den
          Auswahllisten erscheint. Eine Kategorie ab 2027 weglassen: «bis 2026» setzen – die
          Zahlen von 2026 bleiben erhalten. Hat eine ausgelaufene Kategorie trotzdem Zahlen in einem
          Jahr, wird sie dort markiert weiter angezeigt.
        </p>
      </header>
      <FinanceSectionTabs section="budget" active="categories" />
      <FinanceCategoryManager categories={categories} years={years} />
    </div>
  );
}
