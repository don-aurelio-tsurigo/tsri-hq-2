"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast";
import { FinanceCompanyCombobox } from "@/components/finance-company-combobox";
import {
  deleteFinanceCompany,
  mergeFinanceCompanies,
  updateFinanceCompany,
} from "@/lib/actions/finance";
import type { CompanyInput, CompanyOption } from "@/lib/finance/companies";

export function FinanceCompanyEditor({
  company,
  others,
  canDelete,
}: {
  company: { id: string; name: string; notes: string | null };
  others: CompanyOption[];
  canDelete: boolean;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(company.name);
  const [notes, setNotes] = useState(company.notes ?? "");
  const [target, setTarget] = useState<CompanyInput>(null);
  const dirty = name.trim() !== company.name || notes.trim() !== (company.notes ?? "");

  function save(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await updateFinanceCompany({ id: company.id, name, notes });
      if ("error" in result) showToast({ message: result.error });
      else {
        showToast({ message: "Gespeichert." });
        router.refresh();
      }
    });
  }

  function merge() {
    if (!target?.id) return;
    if (
      !window.confirm(
        `«${company.name}» in «${target.name}» zusammenführen? Alle Deals und Buchungen werden übertragen, «${company.name}» verschwindet.`,
      )
    ) {
      return;
    }
    const targetId = target.id;
    startTransition(async () => {
      const result = await mergeFinanceCompanies({ sourceId: company.id, targetId });
      if ("error" in result) {
        showToast({ message: result.error });
        return;
      }
      showToast({ message: `Zusammengeführt in «${target.name}».` });
      router.push(`/finance/organisationen/${targetId}`);
    });
  }

  function remove() {
    if (!window.confirm(`«${company.name}» löschen?`)) return;
    startTransition(async () => {
      const result = await deleteFinanceCompany(company.id);
      if ("error" in result) {
        showToast({ message: result.error });
        return;
      }
      router.push("/finance/organisationen");
    });
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <form onSubmit={save} className="card space-y-3 p-5">
        <div className="field">
          <label htmlFor="company-name">Name</label>
          <input id="company-name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="company-notes">Notizen</label>
          <textarea id="company-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <button type="submit" className="btn btn-primary" disabled={pending || !dirty}>
          Speichern
        </button>
      </form>

      <div className="card space-y-3 p-5">
        <div className="field">
          <label htmlFor="company-merge">Zusammenführen mit …</label>
          <FinanceCompanyCombobox
            inputId="company-merge"
            companies={others}
            value={target}
            onChange={setTarget}
            allowCreate={false}
            placeholder="Organisation suchen"
          />
        </div>
        <p className="text-xs text-[var(--muted)]">
          Für Duplikate: Deals und Buchungen dieser Organisation wandern zur gewählten, diese wird
          danach entfernt.
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-primary" onClick={merge} disabled={pending || !target?.id}>
            Zusammenführen
          </button>
          {canDelete ? (
            <button type="button" className="btn btn-ghost text-[var(--danger)]" onClick={remove} disabled={pending}>
              Löschen
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
