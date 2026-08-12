import Link from "next/link";
import { notFound } from "next/navigation";
import { PayrexxAssignForm } from "@/components/payrexx-assign-form";
import { deletePayrexxPayout } from "@/lib/actions/payrexx";
import {
  formatMoney,
  getPayoutDetail,
} from "@/lib/payrexx";
import { PAYOUT_FEE_KEY, UNMAPPED_KEY } from "@/lib/payrexx/types";
import { requireMembership } from "@/lib/session";

export default async function PayrexxDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { membership } = await requireMembership();
  const detail = await getPayoutDetail(membership.organizationId, id);
  if (!detail) notFound();

  const unmapped = detail.lines.filter((l) => l.categoryKey === UNMAPPED_KEY);
  const shopifyLines = detail.lines.filter(
    (l) => l.categoryKey === "shopify" && l.typ !== "payout-fee",
  );
  const categoryTotals = Object.values(detail.totals).filter(
    (t) => t.count && t.key !== PAYOUT_FEE_KEY,
  );

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <Link
          href="/payrexx"
          className="text-sm font-semibold text-[var(--accent)] hover:underline"
        >
          ← Alle Auszahlungen
        </Link>
        <header className="mt-3">
          <p className="text-sm font-semibold tracking-wide text-[var(--accent)] uppercase">
            Finance · Payrexx
          </p>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
            Auszahlung {detail.date}
          </h1>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-[var(--muted)]">
            <code className="rounded bg-[var(--panel-muted)] px-1.5 py-0.5 text-xs">
              {detail.uuid}
            </code>
            <span>· {detail.currency}</span>
            <span
              className={[
                "inline-flex rounded-md px-2 py-0.5 text-xs font-semibold",
                detail.status === "vollständig"
                  ? "bg-emerald-100 text-emerald-900"
                  : "bg-amber-100 text-amber-900",
              ].join(" ")}
            >
              {detail.status}
            </span>
          </p>
        </header>
      </div>

      <div className="flex flex-wrap gap-2">
        <a
          href={`/payrexx/${detail.id}/export/csv`}
          className="btn btn-secondary text-sm"
        >
          CSV exportieren
        </a>
        <a
          href={`/payrexx/${detail.id}/export/json`}
          className="btn btn-secondary text-sm"
        >
          JSON exportieren
        </a>
        {shopifyLines.length > 0 ? (
          <a
            href={`/payrexx/${detail.id}/export/shopify`}
            className="btn btn-secondary text-sm"
          >
            Shopify-Abgleich CSV
          </a>
        ) : null}
        <form action={deletePayrexxPayout}>
          <input type="hidden" name="payoutId" value={detail.id} />
          <button
            type="submit"
            className="btn btn-secondary text-sm text-[var(--danger)]"
          >
            Payout löschen
          </button>
        </form>
      </div>

      <section className="space-y-3">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
          Tagesübersicht
        </h2>
        <p className="text-sm text-[var(--muted)]">
          Nach Transaktionsdatum und Kategorie (Brutto; Gebühren separat). An
          Wochenenden fasst Payrexx oft mehrere Tage zusammen.
        </p>
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-[var(--muted)]">
                <th className="px-4 py-3 font-semibold">Datum</th>
                <th className="px-4 py-3 font-semibold">Kategorie</th>
                <th className="px-4 py-3 font-semibold">MWST</th>
                <th className="px-4 py-3 text-right font-semibold">Anzahl</th>
                <th className="px-4 py-3 text-right font-semibold">Betrag</th>
              </tr>
            </thead>
            <tbody>
              {detail.dayTotals
                .filter((t) => t.count && t.key !== PAYOUT_FEE_KEY)
                .map((t) => (
                  <tr
                    key={`${t.date}-${t.key}`}
                    className="border-b border-[var(--border)]/60"
                  >
                    <td className="px-4 py-2.5">{t.date}</td>
                    <td className="px-4 py-2.5">{t.label}</td>
                    <td className="px-4 py-2.5">{t.mwst ?? "—"}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {t.count}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {formatMoney(t.netto, detail.currency)}
                    </td>
                  </tr>
                ))}
              <tr className="font-semibold">
                <td colSpan={4} className="px-4 py-3">
                  Auszahlung gesamt
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {formatMoney(detail.grandTotal, detail.currency)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {categoryTotals.length > 0 ? (
        <section className="space-y-3">
          <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
            Summe je Kategorie
          </h2>
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[28rem] text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-[var(--muted)]">
                  <th className="px-4 py-3 font-semibold">Kategorie</th>
                  <th className="px-4 py-3 font-semibold">MWST</th>
                  <th className="px-4 py-3 text-right font-semibold">Anzahl</th>
                  <th className="px-4 py-3 text-right font-semibold">Betrag</th>
                </tr>
              </thead>
              <tbody>
                {categoryTotals.map((t) => (
                  <tr
                    key={t.key}
                    className="border-b border-[var(--border)]/60 last:border-0"
                  >
                    <td className="px-4 py-2.5">{t.label}</td>
                    <td className="px-4 py-2.5">{t.mwst ?? "—"}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {t.count}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {formatMoney(t.netto, detail.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {unmapped.length > 0 ? (
        <section className="space-y-3">
          <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
            Nicht zugeordnet ({unmapped.length})
          </h2>
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-[var(--muted)]">
                  <th className="px-4 py-3 font-semibold">Datum</th>
                  <th className="px-4 py-3 font-semibold">Kanal</th>
                  <th className="px-4 py-3 font-semibold">Beschreibung</th>
                  <th className="px-4 py-3 text-right font-semibold">Netto</th>
                  <th className="px-4 py-3 font-semibold">Zuordnung</th>
                </tr>
              </thead>
              <tbody>
                {unmapped.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-[var(--border)]/60 last:border-0"
                  >
                    <td className="px-4 py-2.5">{row.date ?? "—"}</td>
                    <td className="px-4 py-2.5">{row.channel ?? "—"}</td>
                    <td className="max-w-[14rem] truncate px-4 py-2.5">
                      {row.description ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {formatMoney(row.total, detail.currency)}
                    </td>
                    <td className="px-4 py-2.5">
                      <PayrexxAssignForm
                        lineId={row.id}
                        next={`/payrexx/${detail.id}`}
                        channel={row.channel}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {shopifyLines.length > 0 ? (
        <section className="space-y-3">
          <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
            Shopify-Abgleich ({shopifyLines.length})
          </h2>
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-[var(--muted)]">
                  <th className="px-4 py-3 font-semibold">Datum</th>
                  <th className="px-4 py-3 font-semibold">Kunde</th>
                  <th className="px-4 py-3 font-semibold">Zahlungsart</th>
                  <th className="px-4 py-3 text-right font-semibold">Brutto</th>
                  <th className="px-4 py-3 text-right font-semibold">Gebühren</th>
                  <th className="px-4 py-3 text-right font-semibold">Netto</th>
                </tr>
              </thead>
              <tbody>
                {shopifyLines.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-[var(--border)]/60 last:border-0"
                  >
                    <td className="px-4 py-2.5">{row.date ?? "—"}</td>
                    <td className="px-4 py-2.5">{row.customer ?? "—"}</td>
                    <td className="px-4 py-2.5">{row.paymentMethod ?? "—"}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {formatMoney(row.amount, detail.currency)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {formatMoney(row.fees, detail.currency)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {formatMoney(row.total, detail.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
