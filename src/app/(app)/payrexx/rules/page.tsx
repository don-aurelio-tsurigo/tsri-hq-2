import Link from "next/link";
import {
  removePayrexxChannelRule,
  savePayrexxChannelRule,
} from "@/lib/actions/payrexx";
import {
  assignableCategoryKeys,
  categoryLabel,
  listChannelRules,
} from "@/lib/payrexx";
import { requireAdmin } from "@/lib/session";

export default async function PayrexxRulesPage() {
  const { membership } = await requireAdmin();
  const rules = await listChannelRules(membership.organizationId);
  const options = assignableCategoryKeys();

  return (
    <div className="mx-auto max-w-3xl space-y-8">
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
            Gelernte Kanal-Regeln
          </h1>
          <p className="mt-2 text-[var(--muted)]">
            Exakte Zahlungskanal-Namen, die beim Review mit «Kanal merken»
            gespeichert wurden. Gelten org-weit für neue Imports.
          </p>
        </header>
      </div>

      <section className="card space-y-4 p-5">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
          Regel hinzufügen
        </h2>
        <form action={savePayrexxChannelRule} className="flex flex-wrap gap-3">
          <input
            name="channel"
            required
            placeholder="Zahlungskanal (exakt)"
            className="min-w-[12rem] flex-1 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
          />
          <select
            name="categoryKey"
            required
            defaultValue=""
            className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
          >
            <option value="" disabled>
              Kategorie…
            </option>
            {options.map((key) => (
              <option key={key} value={key}>
                {categoryLabel(key)}
              </option>
            ))}
          </select>
          <button type="submit" className="btn btn-primary text-sm">
            Speichern
          </button>
        </form>
      </section>

      <div className="card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-[var(--muted)]">
              <th className="px-4 py-3 font-semibold">Kanal</th>
              <th className="px-4 py-3 font-semibold">Kategorie</th>
              <th className="px-4 py-3 font-semibold" />
            </tr>
          </thead>
          <tbody>
            {rules.length === 0 ? (
              <tr>
                <td
                  colSpan={3}
                  className="px-4 py-8 text-center text-[var(--muted)]"
                >
                  Noch keine gelernten Regeln.
                </td>
              </tr>
            ) : (
              rules.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-[var(--border)]/60 last:border-0"
                >
                  <td className="px-4 py-2.5 font-medium">{r.channel}</td>
                  <td className="px-4 py-2.5">
                    {categoryLabel(r.categoryKey)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <form action={removePayrexxChannelRule}>
                      <input type="hidden" name="ruleId" value={r.id} />
                      <button
                        type="submit"
                        className="text-xs font-semibold text-[var(--danger)] hover:underline"
                      >
                        Löschen
                      </button>
                    </form>
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
