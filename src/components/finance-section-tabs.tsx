import Link from "next/link";

const SECTIONS = {
  budget: [
    { key: "overview", label: "Übersicht", href: "/finance" },
    { key: "categories", label: "Kategorien", href: "/finance/kategorien" },
  ],
  deals: [
    { key: "deals", label: "Deals", href: "/finance/deals" },
    { key: "companies", label: "Organisationen", href: "/finance/organisationen" },
  ],
} as const;

type Section = keyof typeof SECTIONS;

/** Tabs that group the finance sub pages instead of separate sidebar entries. */
export function FinanceSectionTabs<S extends Section>({
  section,
  active,
}: {
  section: S;
  active: (typeof SECTIONS)[S][number]["key"];
}) {
  return (
    <nav className="flex gap-1 border-b-2 border-[var(--border)]" aria-label="Bereich">
      {SECTIONS[section].map((tab) => {
        const isActive = tab.key === active;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={[
              "-mb-0.5 border-b-2 px-3 py-2 text-sm font-semibold",
              isActive
                ? "border-[var(--fg)] text-[var(--fg)]"
                : "border-transparent text-[var(--muted)] hover:text-[var(--fg)]",
            ].join(" ")}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
