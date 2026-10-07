"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, Pencil, Trash2 } from "lucide-react";
import { FinanceCompanyCombobox } from "@/components/finance-company-combobox";
import { FinanceDealGrid } from "@/components/finance-deal-grid";
import { FinanceDealStatusBadge } from "@/components/finance-deal-status-badge";
import { useToast } from "@/components/toast";
import {
  deleteFinanceDeal,
  markFinanceDealReviewed,
  setFinanceDealStatus,
  updateFinanceDealMeta,
} from "@/lib/actions/finance";
import type { CompanyInput, CompanyOption } from "@/lib/finance/companies";
import type { CategoryOption, DealDetail } from "@/lib/finance/deals";
import { formatChfExact, parseAmountInput } from "@/lib/finance/shared";

const SOURCE_LABEL: Record<string, string> = {
  crm: "Pipedrive",
  manual: "Manuell erfasst",
  airtable: "Airtable-Import",
};

export function FinanceDealEditor({
  deal,
  categories,
  companies,
}: {
  deal: DealDetail;
  categories: CategoryOption[];
  companies: CompanyOption[];
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  const [editingMeta, setEditingMeta] = useState(false);

  function changeStatus(status: "open" | "ignored") {
    startTransition(async () => {
      const result = await setFinanceDealStatus({ dealId: deal.id, status });
      if ("error" in result) showToast({ message: result.error });
      else router.refresh();
    });
  }

  function markReviewed() {
    startTransition(async () => {
      await markFinanceDealReviewed(deal.id);
      router.refresh();
    });
  }

  function remove() {
    const warning =
      deal.source === "crm"
        ? "Deal und alle Buchungen löschen? Schickt Zapier den Deal erneut, wird er wieder angelegt."
        : "Deal und alle Buchungen löschen?";
    if (!window.confirm(warning)) return;
    startTransition(async () => {
      await deleteFinanceDeal(deal.id);
    });
  }

  const hasSavedRates = deal.bookings.length > 0;

  return (
    <div className="space-y-6">
      {deal.changedAfterSplit ? (
        <div className="card flex flex-wrap items-center justify-between gap-3 border-amber-400 bg-amber-50 p-4">
          <p className="text-sm">
            <b>In Pipedrive geändert</b>, nachdem der Deal aufgeteilt wurde. Deal-Betrag jetzt{" "}
            <b>{formatChfExact(deal.totalAmount)}</b> – bitte Aufteilung prüfen.
          </p>
          <button type="button" className="btn btn-ghost text-sm" onClick={markReviewed} disabled={pending}>
            Als geprüft markieren
          </button>
        </div>
      ) : null}

      <section className="card space-y-4 p-5">
        {editingMeta ? (
          <MetaForm
            deal={deal}
            companies={companies}
            onDone={() => {
              setEditingMeta(false);
              router.refresh();
            }}
          />
        ) : (
          <div className="flex flex-wrap items-start justify-between gap-4">
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
              <dt className="text-[var(--muted)]">Betrag</dt>
              <dd className="font-semibold tabular-nums">{formatChfExact(deal.totalAmount)}</dd>
              <dt className="text-[var(--muted)]">Organisation</dt>
              <dd>
                {deal.company ? (
                  <Link
                    href={`/finance/organisationen/${deal.company.id}`}
                    className="font-semibold text-[var(--accent)] hover:underline"
                  >
                    {deal.company.name}
                  </Link>
                ) : (
                  "—"
                )}
              </dd>
              <dt className="text-[var(--muted)]">Zuständig</dt>
              <dd>{deal.responsibleName ?? "—"}</dd>
              <dt className="text-[var(--muted)]">Quelle</dt>
              <dd>
                {SOURCE_LABEL[deal.source] ?? deal.source}
                {deal.externalId && deal.source === "crm" ? ` · Deal #${deal.externalId}` : ""}
                {" · "}
                {new Date(deal.createdAt).toLocaleDateString("de-CH")}
              </dd>
              <dt className="text-[var(--muted)]">Status</dt>
              <dd>
                <FinanceDealStatusBadge status={deal.status} changed={deal.changedAfterSplit} />
              </dd>
              {deal.bexioUrl ? (
                <>
                  <dt className="text-[var(--muted)]">Bexio</dt>
                  <dd>
                    <a
                      href={deal.bexioUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-semibold text-[var(--accent)] hover:underline"
                    >
                      Auftrag öffnen <ExternalLink className="size-3" />
                    </a>
                  </dd>
                </>
              ) : null}
            </dl>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-ghost inline-flex items-center gap-1.5 text-sm"
                onClick={() => setEditingMeta(true)}
              >
                <Pencil className="size-3.5" /> Bearbeiten
              </button>
              {!hasSavedRates && deal.status === "open" ? (
                <button type="button" className="btn btn-ghost text-sm" onClick={() => changeStatus("ignored")} disabled={pending}>
                  Ignorieren
                </button>
              ) : null}
              {deal.status === "ignored" ? (
                <button type="button" className="btn btn-ghost text-sm" onClick={() => changeStatus("open")} disabled={pending}>
                  Wieder öffnen
                </button>
              ) : null}
              <button
                type="button"
                className="btn btn-ghost inline-flex items-center gap-1.5 text-sm text-[var(--danger)]"
                onClick={remove}
                disabled={pending}
              >
                <Trash2 className="size-3.5" /> Löschen
              </button>
            </div>
          </div>
        )}
      </section>

      <FinanceDealGrid deal={deal} categories={categories} />

      {deal.payload ? (
        <details className="text-xs">
          <summary className="cursor-pointer text-[var(--muted)]">Rohdaten vom Webhook</summary>
          <pre className="mt-2 overflow-x-auto rounded bg-[var(--panel-muted)] p-3">
            {JSON.stringify(deal.payload, null, 2)}
          </pre>
        </details>
      ) : null}
    </div>
  );
}

function MetaForm({
  deal,
  companies,
  onDone,
}: {
  deal: DealDetail;
  companies: CompanyOption[];
  onDone: () => void;
}) {
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState(deal.title);
  const [company, setCompany] = useState<CompanyInput>(deal.company);
  const [amount, setAmount] = useState(String(deal.totalAmount));
  const [bexioUrl, setBexioUrl] = useState(deal.bexioUrl ?? "");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const total = parseAmountInput(amount);
    if (total === null || Number.isNaN(total)) {
      showToast({ message: "Ungültiger Betrag." });
      return;
    }
    startTransition(async () => {
      const result = await updateFinanceDealMeta({
        dealId: deal.id,
        title,
        company,
        totalAmount: total,
        bexioUrl,
      });
      if ("error" in result) showToast({ message: result.error });
      else onDone();
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <div className="field sm:col-span-2">
        <label htmlFor="meta-title">Titel</label>
        <input id="meta-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
      </div>
      <div className="field">
        <label htmlFor="meta-org">Organisation</label>
        <FinanceCompanyCombobox
          inputId="meta-org"
          companies={companies}
          value={company}
          onChange={setCompany}
        />
      </div>
      <div className="field">
        <label htmlFor="meta-amount">Betrag (CHF)</label>
        <input id="meta-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </div>
      <div className="field sm:col-span-2">
        <label htmlFor="meta-bexio">Bexio-Link</label>
        <input id="meta-bexio" type="url" value={bexioUrl} onChange={(e) => setBexioUrl(e.target.value)} />
      </div>
      {deal.source === "crm" ? (
        <p className="text-xs text-[var(--muted)] sm:col-span-2">
          Hinweis: Schickt Zapier den Deal erneut, werden diese Felder mit den Pipedrive-Werten überschrieben.
        </p>
      ) : null}
      <div className="flex gap-2 sm:col-span-2">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          Speichern
        </button>
        <button type="button" className="btn btn-ghost" onClick={onDone}>
          Abbrechen
        </button>
      </div>
    </form>
  );
}
