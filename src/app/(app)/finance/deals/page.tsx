import Link from "next/link";
import { FinanceDealStatusBadge } from "@/components/finance-deal-status-badge";
import { FinanceWebhookPanel } from "@/components/finance-webhook-panel";
import { getPublicAppOrigin } from "@/lib/app-url";
import { createFinanceDeal } from "@/lib/actions/finance";
import { prisma } from "@/lib/db";
import { getWebhookToken, listDeals, type DealListItem } from "@/lib/finance/deals";
import { formatChfExact, monthLabel } from "@/lib/finance/shared";
import { pageTitle } from "@/lib/link-preview";
import { requireCapability } from "@/lib/session";

export const metadata = pageTitle("Finance");

const FILTERS = [
  { key: "open", label: "Offen" },
  { key: "review", label: "Zu prüfen" },
  { key: "split", label: "Aufgeteilt" },
  { key: "ignored", label: "Ignoriert" },
  { key: "all", label: "Alle" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

const SOURCE_LABEL: Record<string, string> = {
  crm: "Pipedrive",
  manual: "Manuell",
  airtable: "Airtable",
};

export default async function FinanceDealsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; neu?: string; fehler?: string }>;
}) {
  const { membership } = await requireCapability("finance");
  const params = await searchParams;
  const filter: FilterKey = FILTERS.some((f) => f.key === params.status)
    ? (params.status as FilterKey)
    : "open";
  const q = (params.q ?? "").slice(0, 200);
  const organizationId = membership.organizationId;

  const [deals, token, openCount, reviewCount] = await Promise.all([
    listDeals(organizationId, filter, q),
    getWebhookToken(organizationId),
    prisma.financeDeal.count({ where: { organizationId, status: "open" } }),
    prisma.financeDeal.count({ where: { organizationId, changedAfterSplit: true } }),
  ]);
  const counts: Partial<Record<FilterKey, number>> = { open: openCount, review: reviewCount };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold tracking-wide text-[var(--accent)] uppercase">Finance</p>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
            Deals
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Deals aus Pipedrive landen hier und werden in Monatsraten pro Kategorie aufgeteilt.
          </p>
        </div>
      </header>

      <FinanceWebhookPanel
        url={`${getPublicAppOrigin()}/api/finance/deals/webhook`}
        initialToken={token}
      />

      <details className="card p-5" open={params.neu === "1"}>
        <summary className="cursor-pointer list-none font-semibold">+ Deal manuell erfassen</summary>
        {params.fehler ? (
          <p className="mt-3 text-sm font-semibold text-[var(--danger)]">Titel und Betrag sind Pflicht.</p>
        ) : null}
        <form action={createFinanceDeal} className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="field sm:col-span-2">
            <label htmlFor="deal-title">Titel</label>
            <input id="deal-title" name="title" required maxLength={500} placeholder="z.B. Jahresdeal Kunsthaus 27" />
          </div>
          <div className="field">
            <label htmlFor="deal-org">Organisation</label>
            <input id="deal-org" name="organisation" maxLength={500} />
          </div>
          <div className="field">
            <label htmlFor="deal-amount">Gesamtbetrag (CHF)</label>
            <input id="deal-amount" name="totalAmount" required inputMode="decimal" placeholder="12000" />
          </div>
          <div className="field">
            <label htmlFor="deal-owner">Zuständig</label>
            <input id="deal-owner" name="responsibleName" maxLength={200} />
          </div>
          <div className="field">
            <label htmlFor="deal-bexio">Bexio-Link</label>
            <input id="deal-bexio" name="bexioUrl" type="url" placeholder="https://office.bexio.com/…" />
          </div>
          <div className="sm:col-span-2">
            <button type="submit" className="btn btn-primary">
              Anlegen und aufteilen
            </button>
          </div>
        </form>
      </details>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap gap-1" aria-label="Status">
          {FILTERS.map((f) => {
            const href = `/finance/deals?status=${f.key}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
            const count = counts[f.key];
            return (
              <Link
                key={f.key}
                href={href}
                className={[
                  "rounded-lg px-3 py-1.5 text-sm font-semibold",
                  filter === f.key
                    ? "bg-[var(--fg)] !text-white"
                    : "text-[var(--muted)] hover:bg-[var(--panel-muted)]",
                ].join(" ")}
              >
                {f.label}
                {count ? (
                  <span
                    className={[
                      "ml-1.5 rounded-full px-1.5 text-xs",
                      filter === f.key ? "bg-white/20" : "bg-[var(--accent-soft)] text-[var(--accent-hover)]",
                    ].join(" ")}
                  >
                    {count}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
        <form className="flex gap-2" action="/finance/deals">
          <input type="hidden" name="status" value={filter} />
          <input
            name="q"
            defaultValue={q}
            placeholder="Suche Titel, Organisation, ID"
            aria-label="Deals durchsuchen"
            className="w-64 rounded-lg border-2 border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-sm"
          />
        </form>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[48rem] text-left text-sm">
          <thead>
            <tr className="border-b-2 border-[var(--border)] text-[var(--muted)]">
              <th className="px-4 py-3 font-semibold">Deal</th>
              <th className="px-4 py-3 font-semibold">Quelle</th>
              <th className="px-4 py-3 font-semibold">Raten</th>
              <th className="px-4 py-3 text-right font-semibold">Betrag</th>
              <th className="px-4 py-3 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {deals.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-[var(--muted)]">
                  {filter === "open" && !q ? "Keine offenen Deals. 🎉" : "Keine Deals gefunden."}
                </td>
              </tr>
            ) : (
              deals.map((d) => <DealRow key={d.id} deal={d} />)
            )}
          </tbody>
        </table>
      </div>
      {deals.length === 300 ? (
        <p className="text-xs text-[var(--muted)]">Es werden die neusten 300 Deals angezeigt – Suche verwenden.</p>
      ) : null}
    </div>
  );
}

function DealRow({ deal }: { deal: DealListItem }) {
  const diff = Math.round((deal.bookedAmount - deal.totalAmount) * 100) / 100;
  return (
    <tr className="border-b border-[var(--border)]/60 last:border-0 hover:bg-[#f6f6f6]">
      <td className="px-4 py-3">
        <Link href={`/finance/deals/${deal.id}`} className="font-semibold hover:underline">
          {deal.title}
        </Link>
        <p className="text-xs text-[var(--muted)]">
          {[deal.organisation, deal.responsibleName].filter(Boolean).join(" · ") || "—"}
        </p>
      </td>
      <td className="px-4 py-3 text-xs text-[var(--muted)]">
        {SOURCE_LABEL[deal.source] ?? deal.source}
        {deal.source === "crm" && deal.externalId ? ` #${deal.externalId}` : ""}
        <br />
        {new Date(deal.createdAt).toLocaleDateString("de-CH")}
      </td>
      <td className="px-4 py-3 text-xs">
        {deal.bookingCount === 0 ? (
          <span className="text-[var(--muted)]">—</span>
        ) : (
          <>
            {deal.bookingCount} {deal.bookingCount === 1 ? "Rate" : "Raten"}
            <br />
            <span className="text-[var(--muted)]">
              {deal.firstMonth === deal.lastMonth
                ? monthLabel(deal.firstMonth!)
                : `${monthLabel(deal.firstMonth!)} – ${monthLabel(deal.lastMonth!)}`}
            </span>
          </>
        )}
      </td>
      <td className="px-4 py-3 text-right tabular-nums">
        <span className="font-semibold">{formatChfExact(deal.totalAmount)}</span>
        {deal.bookingCount > 0 && diff !== 0 ? (
          <p className="text-xs text-amber-700">Raten {diff > 0 ? "+" : ""}{formatChfExact(diff)}</p>
        ) : null}
      </td>
      <td className="px-4 py-3">
        <FinanceDealStatusBadge status={deal.status} changed={deal.changedAfterSplit} />
      </td>
    </tr>
  );
}
