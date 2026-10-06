"use client";

import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Archive, ArchiveRestore } from "lucide-react";
import { useToast } from "@/components/toast";
import {
  createFinanceCategory,
  moveFinanceCategory,
  updateFinanceCategory,
} from "@/lib/actions/finance";
import type { AdminCategory } from "@/lib/finance/categories";
import { isCategoryActive, type FinanceKind } from "@/lib/finance/shared";

const KIND_LABEL: Record<FinanceKind, string> = { income: "Einnahmen", expense: "Ausgaben" };

type Patch = Parameters<typeof updateFinanceCategory>[0];

export function FinanceCategoryManager({
  categories,
  years,
}: {
  categories: AdminCategory[];
  /** Selectable years for «gültig ab/bis» */
  years: number[];
}) {
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  const [showArchived, setShowArchived] = useState(false);
  const groups = [...new Set(categories.map((c) => c.group).filter((g): g is string => !!g))].sort();
  const currentYear = new Date().getFullYear();

  function run(action: () => Promise<{ error: string } | { ok: true }>, success?: string) {
    startTransition(async () => {
      const result = await action();
      if ("error" in result) showToast({ message: result.error });
      else if (success) showToast({ message: success });
    });
  }

  const save = (patch: Patch, success?: string) => run(() => updateFinanceCategory(patch), success);

  const visible = categories.filter((c) => showArchived || !c.archived);
  const archivedCount = categories.filter((c) => c.archived).length;

  return (
    <div className="space-y-6">
      <NewCategoryForm groups={groups} years={years} onCreate={(input) => run(() => createFinanceCategory(input), `«${input.name}» angelegt.`)} pending={pending} />

      <datalist id="finance-category-groups">
        {groups.map((g) => (
          <option key={g} value={g} />
        ))}
      </datalist>

      {(["income", "expense"] as const).map((kind) => {
        const rows = visible.filter((c) => c.kind === kind);
        return (
          <section key={kind} className="card overflow-x-auto">
            <h2 className="border-b-2 border-[var(--border)] bg-[var(--fg)] px-4 py-2 text-xs font-bold tracking-wider text-white uppercase">
              {KIND_LABEL[kind]}
            </h2>
            <table className="w-full min-w-[56rem] text-sm">
              <thead>
                <tr className="text-left text-xs text-[var(--muted)]">
                  <th className="w-16 px-3 py-2 font-semibold">Reihe</th>
                  <th className="px-3 py-2 font-semibold">Name</th>
                  <th className="px-3 py-2 font-semibold">Oberkategorie</th>
                  <th className="px-3 py-2 font-semibold">Gültig ab</th>
                  <th className="px-3 py-2 font-semibold">Gültig bis</th>
                  <th className="px-3 py-2 font-semibold" title="Nur in der Liquiditätsplanung, nicht in der Budget-Übersicht">
                    Nur Liquidität
                  </th>
                  <th className="px-3 py-2 font-semibold">Verwendung</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((c, i) => {
                  const activeNow = isCategoryActive(c, currentYear);
                  return (
                    <tr
                      key={c.id}
                      className={[
                        "border-t border-[var(--border)]/60",
                        c.archived ? "opacity-50" : "",
                      ].join(" ")}
                    >
                      <td className="px-3 py-1.5">
                        <div className="flex gap-0.5">
                          <button
                            type="button"
                            disabled={pending || i === 0}
                            onClick={() => run(() => moveFinanceCategory({ id: c.id, direction: -1 }))}
                            className="rounded p-1 text-[var(--muted)] hover:bg-[var(--panel-muted)] disabled:opacity-30"
                            aria-label={`${c.name} nach oben`}
                          >
                            <ArrowUp className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={pending || i === rows.length - 1}
                            onClick={() => run(() => moveFinanceCategory({ id: c.id, direction: 1 }))}
                            className="rounded p-1 text-[var(--muted)] hover:bg-[var(--panel-muted)] disabled:opacity-30"
                            aria-label={`${c.name} nach unten`}
                          >
                            <ArrowDown className="size-3.5" />
                          </button>
                        </div>
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          key={c.name}
                          defaultValue={c.name}
                          size={1}
                          aria-label="Name"
                          onBlur={(e) => {
                            const v = e.currentTarget.value.trim();
                            if (v && v !== c.name) save({ id: c.id, name: v }, "Name gespeichert.");
                            else e.currentTarget.value = c.name;
                          }}
                          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                          className="w-full min-w-[12rem] rounded-md border-2 border-transparent px-2 py-1 font-semibold hover:border-[var(--border)] focus:border-[var(--accent)] focus:outline-none"
                        />
                        {!activeNow && !c.archived ? (
                          <span className="ml-2 text-xs text-[var(--muted)]">nicht aktiv {currentYear}</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          key={c.group ?? ""}
                          defaultValue={c.group ?? ""}
                          list="finance-category-groups"
                          aria-label="Oberkategorie"
                          placeholder="—"
                          onBlur={(e) => {
                            const v = e.currentTarget.value.trim();
                            if (v !== (c.group ?? "")) save({ id: c.id, group: v });
                          }}
                          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                          className="w-40 rounded-md border-2 border-transparent px-2 py-1 hover:border-[var(--border)] focus:border-[var(--accent)] focus:outline-none"
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <YearSelect
                          label={`${c.name} gültig ab`}
                          value={c.validFrom}
                          years={years}
                          emptyLabel="immer"
                          onChange={(v) => save({ id: c.id, validFrom: v }, v ? `Gültig ab ${v}.` : "Gültig ohne Startjahr.")}
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <YearSelect
                          label={`${c.name} gültig bis`}
                          value={c.validUntil}
                          years={years}
                          emptyLabel="offen"
                          onChange={(v) => save({ id: c.id, validUntil: v }, v ? `Gültig bis ${v}.` : "Gültig ohne Enddatum.")}
                        />
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        <input
                          type="checkbox"
                          checked={c.liquidityOnly}
                          aria-label={`${c.name} nur Liquidität`}
                          onChange={(e) => save({ id: c.id, liquidityOnly: e.target.checked })}
                        />
                      </td>
                      <td
                        className="px-3 py-1.5 text-xs whitespace-nowrap text-[var(--muted)] tabular-nums"
                        title={`${c.bookingCount} Buchungen, ${c.budgetCount} Budget-Monate`}
                      >
                        {c.bookingCount} Buchungen
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() =>
                            save(
                              { id: c.id, archived: !c.archived },
                              c.archived ? `«${c.name}» wiederhergestellt.` : `«${c.name}» archiviert.`,
                            )
                          }
                          className="btn btn-ghost p-1.5"
                          title={
                            c.archived
                              ? "Wiederherstellen"
                              : "Archivieren: verschwindet überall, Daten bleiben erhalten"
                          }
                          aria-label={c.archived ? `${c.name} wiederherstellen` : `${c.name} archivieren`}
                        >
                          {c.archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        );
      })}

      {archivedCount > 0 ? (
        <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          {archivedCount} archivierte Kategorie{archivedCount === 1 ? "" : "n"} anzeigen
        </label>
      ) : null}
    </div>
  );
}

function YearSelect({
  label,
  value,
  years,
  emptyLabel,
  onChange,
}: {
  label: string;
  value: number | null;
  years: number[];
  emptyLabel: string;
  onChange: (value: number | null) => void;
}) {
  const options = value !== null && !years.includes(value) ? [...years, value].sort() : years;
  return (
    <select
      aria-label={label}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
      className="rounded-md border-2 border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1"
    >
      <option value="">{emptyLabel}</option>
      {options.map((y) => (
        <option key={y} value={y}>
          {y}
        </option>
      ))}
    </select>
  );
}

function NewCategoryForm({
  groups,
  years,
  pending,
  onCreate,
}: {
  groups: string[];
  years: number[];
  pending: boolean;
  onCreate: (input: { name: string; kind: FinanceKind; group: string; validFrom: number | null }) => void;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<FinanceKind>("income");
  const [group, setGroup] = useState("");
  const [validFrom, setValidFrom] = useState<number | null>(null);

  return (
    <form
      className="card grid gap-4 p-5 sm:grid-cols-[2fr_1fr_1fr_1fr_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        onCreate({ name: name.trim(), kind, group, validFrom });
        setName("");
        setGroup("");
      }}
    >
      <div className="field">
        <label htmlFor="cat-name">Neue Kategorie</label>
        <input id="cat-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="z.B. Podcast-Sponsoring" required />
      </div>
      <div className="field">
        <label htmlFor="cat-kind">Art</label>
        <select id="cat-kind" value={kind} onChange={(e) => setKind(e.target.value as FinanceKind)}>
          <option value="income">Einnahme</option>
          <option value="expense">Ausgabe</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="cat-group">Oberkategorie</label>
        <input id="cat-group" value={group} onChange={(e) => setGroup(e.target.value)} list="finance-category-groups" placeholder={groups[0] ? `z.B. ${groups[0]}` : "optional"} />
      </div>
      <div className="field">
        <label htmlFor="cat-from">Gültig ab</label>
        <select id="cat-from" value={validFrom ?? ""} onChange={(e) => setValidFrom(e.target.value ? Number(e.target.value) : null)}>
          <option value="">sofort</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" className="btn btn-primary" disabled={pending}>
        Anlegen
      </button>
    </form>
  );
}
