import Link from "next/link";
import { PayrexxUploadForm } from "@/components/payrexx-upload-form";
import { deletePayrexxPayout } from "@/lib/actions/payrexx";
import { countUnmapped, formatMoney, listPayouts } from "@/lib/payrexx";
import { requireCapability } from "@/lib/session";

export default async function PayrexxPage() {
  const { membership } = await requireCapability("finance");
  const [payouts, unmappedTotal] = await Promise.all([
    listPayouts(membership.organizationId),
    countUnmapped(membership.organizationId),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header>
        <p className="text-sm font-semibold tracking-wide text-[var(--accent)] uppercase">
          Finance
        </p>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
          Payrexx-Tool
        </h1>
        <p className="mt-2 max-w-2xl text-[var(--muted)]">
          Payout-Exports aus Payrexx nach Buchhaltungs-Kategorien aufschlüsseln,
          offene Zeilen reviewen und als CSV exportieren.
        </p>
      </header>

      {unmappedTotal > 0 ? (
        <div className="card flex flex-wrap items-center justify-between gap-3 border-[var(--accent)] bg-[var(--accent-soft)] p-4">
          <p className="text-sm font-semibold">
            {unmappedTotal} Zeile(n) brauchen eine manuelle Zuordnung.
          </p>
          <Link
            href="/payrexx/review"
            className="text-sm font-semibold text-[var(--accent-hover)] underline-offset-2 hover:underline"
          >
            Zur Review-Queue →
          </Link>
        </div>
      ) : null}

      <section className="card space-y-4 p-5">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
          Export hochladen
        </h2>
        <p className="text-sm text-[var(--muted)]">
          In Payrexx die Auszahlung als XLSX exportieren (enthält
          «Zahlungskanal») und hier importieren.
        </p>
        <PayrexxUploadForm />
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
            Auszahlungen
          </h2>
          <div className="flex gap-3 text-sm">
            <Link
              href="/payrexx/review"
              className="font-semibold text-[var(--accent)] hover:underline"
            >
              Review
            </Link>
            <Link
              href="/payrexx/rules"
              className="font-semibold text-[var(--accent)] hover:underline"
            >
              Kanal-Regeln
            </Link>
          </div>
        </div>

        <div className="card overflow-x-auto">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-[var(--muted)]">
                <th className="px-4 py-3 font-semibold">Datum</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 text-right font-semibold">Gesamt</th>
                <th className="px-4 py-3 text-right font-semibold">Offen</th>
                <th className="px-4 py-3 font-semibold" />
              </tr>
            </thead>
            <tbody>
              {payouts.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-[var(--muted)]"
                  >
                    Noch keine Payouts. XLSX-Export aus Payrexx hochladen.
                  </td>
                </tr>
              ) : (
                payouts.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-[var(--border)]/60 last:border-0"
                  >
                    <td className="px-4 py-3 font-semibold">{p.date}</td>
                    <td className="px-4 py-3">
                      <span
                        className={[
                          "inline-flex rounded-md px-2 py-0.5 text-xs font-semibold",
                          p.status === "vollständig"
                            ? "bg-emerald-100 text-emerald-900"
                            : "bg-amber-100 text-amber-900",
                        ].join(" ")}
                      >
                        {p.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatMoney(p.grandTotal, p.currency)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {p.unmappedCount}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/payrexx/${p.id}`}
                          className="font-semibold text-[var(--accent)] hover:underline"
                        >
                          Öffnen
                        </Link>
                        <form action={deletePayrexxPayout}>
                          <input type="hidden" name="payoutId" value={p.id} />
                          <button
                            type="submit"
                            className="text-xs font-semibold text-[var(--danger)] hover:underline"
                          >
                            Löschen
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
