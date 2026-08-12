import Link from "next/link";
import { PayrexxAssignForm } from "@/components/payrexx-assign-form";
import { formatMoney, listUnmappedLines } from "@/lib/payrexx";
import { requireAdmin } from "@/lib/session";

export default async function PayrexxReviewPage() {
  const { membership } = await requireAdmin();
  const lines = await listUnmappedLines(membership.organizationId);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <Link
          href="/payrexx"
          className="text-sm font-semibold text-[var(--accent)] hover:underline"
        >
          ← Payrexx-Tool
        </Link>
        <header className="mt-3">
          <p className="text-sm font-semibold tracking-wide text-[var(--accent)] uppercase">
            Finance · Payrexx
          </p>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
            Review-Queue
          </h1>
          <p className="mt-2 text-[var(--muted)]">
            {lines.length === 0
              ? "Alles zugeordnet — keine offenen Zeilen."
              : `${lines.length} Zeile(n) ohne Kategorie.`}
          </p>
        </header>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[44rem] text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-[var(--muted)]">
              <th className="px-4 py-3 font-semibold">Payout</th>
              <th className="px-4 py-3 font-semibold">Datum</th>
              <th className="px-4 py-3 font-semibold">Kanal</th>
              <th className="px-4 py-3 font-semibold">Beschreibung</th>
              <th className="px-4 py-3 text-right font-semibold">Netto</th>
              <th className="px-4 py-3 font-semibold">Zuordnung</th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-[var(--muted)]"
                >
                  Keine offenen Zeilen.
                </td>
              </tr>
            ) : (
              lines.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-[var(--border)]/60 last:border-0"
                >
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/payrexx/${row.payoutId}`}
                      className="font-semibold text-[var(--accent)] hover:underline"
                    >
                      {row.payoutDate}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">{row.date ?? "—"}</td>
                  <td className="px-4 py-2.5">{row.channel ?? "—"}</td>
                  <td className="max-w-[12rem] truncate px-4 py-2.5">
                    {row.description ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {formatMoney(row.total)}
                  </td>
                  <td className="px-4 py-2.5">
                    <PayrexxAssignForm
                      lineId={row.id}
                      next="/payrexx/review"
                      channel={row.channel}
                    />
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
