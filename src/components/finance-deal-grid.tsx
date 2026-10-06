"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { FinanceMonthPicker } from "@/components/finance-month-picker";
import { useToast } from "@/components/toast";
import { saveFinanceDealSplit } from "@/lib/actions/finance";
import type { CategoryOption, DealDetail } from "@/lib/finance/deals";
import {
  cellAmount,
  cellKey,
  gridFromBookings,
  gridHasInvalid,
  gridToRows,
  gridTotal,
  type DealGrid,
} from "@/lib/finance/grid";
import {
  addMonths,
  formatChf,
  formatChfExact,
  isCategoryActive,
  isMonthKey,
  monthKey,
  monthLabel,
  parseAmountInput,
  parseMonthKey,
  roundCents,
  type MonthKey,
} from "@/lib/finance/shared";

export function FinanceDealGrid({
  deal,
  categories,
}: {
  deal: DealDetail;
  categories: CategoryOption[];
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();

  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  // A new deal starts with one month column (Zapier start month or this month),
  // so amounts can be entered right away.
  const [grid, setGrid] = useState<DealGrid>(() => {
    const today = new Date();
    return gridFromBookings(
      deal.bookings,
      categories.map((c) => c.id),
      {
        month: deal.suggestion.startMonth ?? monthKey(today.getFullYear(), today.getMonth()),
        categoryId: deal.suggestion.categoryId,
      },
    );
  });
  const [dirty, setDirty] = useState(false);
  const [acceptDifference, setAcceptDifference] = useState(false);
  /** Last selected cell – target of «Rest eintragen» */
  const [selected, setSelected] = useState<{ categoryId: string; month: MonthKey } | null>(null);

  const now = new Date();

  const total = gridTotal(grid);
  const open = roundCents(deal.totalAmount - total);
  const invalid = gridHasInvalid(grid);
  const filledCells = gridToRows(grid, deal.title).length;
  // Only offer categories valid in at least one of the grid's years
  const gridYears = grid.months.length
    ? [...new Set(grid.months.map((m) => parseMonthKey(m)[0]))]
    : [now.getFullYear()];
  const unusedCategories = categories.filter(
    (c) => !grid.categoryIds.includes(c.id) && gridYears.some((y) => isCategoryActive(c, y)),
  );

  function update(next: DealGrid) {
    setGrid(next);
    setDirty(true);
    setAcceptDifference(false);
  }

  function setCell(categoryId: string, month: MonthKey, value: string) {
    update({ ...grid, cells: { ...grid.cells, [cellKey(categoryId, month)]: value } });
  }

  /** Append the month after the last column (or this month if empty). */
  function addMonth() {
    const last = grid.months[grid.months.length - 1];
    let next = last ? addMonths(last, 1) : monthKey(now.getFullYear(), now.getMonth());
    while (grid.months.includes(next)) next = addMonths(next, 1);
    update({ ...grid, months: [...grid.months, next].sort() });
  }

  /** Change a column's month; its amounts (and booking ids) move along. */
  function changeMonth(from: MonthKey, to: MonthKey) {
    if (from === to || !isMonthKey(to)) return;
    if (grid.months.includes(to)) {
      showToast({ message: `${monthLabel(to)} ist schon im Raster.` });
      return;
    }
    const cells = { ...grid.cells };
    const existing = { ...grid.existing };
    for (const c of grid.categoryIds) {
      const fromKey = cellKey(c, from);
      const toKey = cellKey(c, to);
      if (fromKey in cells) {
        cells[toKey] = cells[fromKey];
        delete cells[fromKey];
      }
      if (existing[fromKey]) {
        existing[toKey] = existing[fromKey];
        delete existing[fromKey];
      }
    }
    update({
      ...grid,
      months: grid.months.map((m) => (m === from ? to : m)).sort(),
      cells,
      existing,
    });
    if (selected?.month === from) setSelected({ ...selected, month: to });
  }

  function removeMonth(month: MonthKey) {
    update({ ...grid, months: grid.months.filter((m) => m !== month) });
    if (selected?.month === month) setSelected(null);
  }

  function addCategory(categoryId: string) {
    if (!categoryId || grid.categoryIds.includes(categoryId)) return;
    update({ ...grid, categoryIds: [...grid.categoryIds, categoryId] });
  }

  function removeCategory(categoryId: string) {
    update({ ...grid, categoryIds: grid.categoryIds.filter((c) => c !== categoryId) });
    if (selected?.categoryId === categoryId) setSelected(null);
  }

  function fillRest(categoryId: string, month: MonthKey) {
    const current = cellAmount(grid, categoryId, month);
    const base = Number.isNaN(current) ? 0 : current;
    setCell(categoryId, month, String(roundCents(base + open)));
  }

  function save() {
    if (invalid) {
      showToast({ message: "Mindestens ein Betrag ist ungültig (rot markiert)." });
      return;
    }
    const rows = gridToRows(grid, deal.title);
    startTransition(async () => {
      const result = await saveFinanceDealSplit({
        dealId: deal.id,
        totalAmount: deal.totalAmount,
        acceptDifference,
        rows,
      });
      if ("error" in result) {
        showToast({ message: result.error });
        return;
      }
      setDirty(false);
      showToast({
        message: rows.length
          ? `${rows.length} Buchung${rows.length === 1 ? "" : "en"} gespeichert.`
          : "Aufteilung entfernt.",
      });
      router.refresh();
    });
  }

  const colTotal = (month: MonthKey) =>
    roundCents(
      grid.categoryIds.reduce((s, c) => {
        const n = cellAmount(grid, c, month);
        return s + (Number.isNaN(n) ? 0 : n);
      }, 0),
    );
  const rowTotal = (categoryId: string) =>
    roundCents(
      grid.months.reduce((s, m) => {
        const n = cellAmount(grid, categoryId, m);
        return s + (Number.isNaN(n) ? 0 : n);
      }, 0),
    );

  const canSave =
    !pending && dirty && !invalid && (open === 0 || filledCells === 0 || acceptDifference);

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-col gap-3 border-b-2 border-[var(--border)] px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 sm:max-w-xl">
          <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">Aufteilen</h2>
          <p className="mt-0.5 text-sm text-[var(--muted)]">
            Monat im Spaltenkopf wählen, links eine Kategorie hinzufügen und Beträge eintragen. Jede gefüllte Zelle wird eine
            Buchung. Taste <kbd className="rounded border border-[var(--border)] px-1">=</kbd> trägt den
            offenen Rest ein.
          </p>
        </div>
        <div className="shrink-0 text-sm tabular-nums sm:text-right">
          <p>
            Verteilt <b>{formatChfExact(total)}</b> von {formatChfExact(deal.totalAmount)}
          </p>
          <p
            className={[
              "mt-0.5 font-semibold",
              open === 0 ? "text-emerald-700" : "text-amber-700",
            ].join(" ")}
          >
            {open === 0 ? "Vollständig verteilt" : `Offen ${formatChfExact(open)}`}
          </p>
          {/* Always reserve the line so the grid never jumps */}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => selected && fillRest(selected.categoryId, selected.month)}
            disabled={!(open !== 0 && selected)}
            className={[
              "mt-1 block max-w-[20rem] truncate text-xs font-semibold text-[var(--accent)] hover:underline sm:ml-auto",
              open !== 0 && selected ? "" : "invisible",
            ].join(" ")}
          >
            {selected
              ? `Rest in «${categoryById.get(selected.categoryId)?.name ?? "Kategorie"} · ${monthLabel(selected.month)}» eintragen`
              : "Rest eintragen"}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-0 text-sm tabular-nums">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 min-w-[14rem] border-r-2 border-b-2 border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-left font-semibold">
                Kategorie
              </th>
              {grid.months.map((m) => {
                return (
                  <th
                    key={m}
                    className="min-w-[11rem] border-r border-b-2 border-[var(--border)] px-2 py-1.5 text-left font-semibold whitespace-nowrap"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <FinanceMonthPicker
                        value={m}
                        onChange={(to) => changeMonth(m, to)}
                        label={`Spalte ${monthLabel(m)}`}
                        compact
                      />
                      <button
                        type="button"
                        onClick={() => removeMonth(m)}
                        className="rounded p-0.5 text-[var(--muted)] hover:bg-[var(--panel-muted)] hover:text-[var(--fg)]"
                        aria-label={`${monthLabel(m)} entfernen`}
                        title="Monat entfernen"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  </th>
                );
              })}
              <th className="border-r border-b-2 border-[var(--border)] px-2 py-1.5 text-left">
                <button
                  type="button"
                  onClick={addMonth}
                  className="btn btn-ghost inline-flex items-center gap-1 px-2 py-1 text-xs whitespace-nowrap"
                  title="Folgemonat als neue Spalte anhängen"
                >
                  <Plus className="size-3.5" /> Monat
                </button>
              </th>
              <th className="min-w-[7rem] border-b-2 border-l-2 border-[var(--border)] bg-[var(--panel-muted)]/50 px-3 py-2 text-right font-semibold">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {grid.categoryIds.map((categoryId) => {
              const category = categoryById.get(categoryId);
              return (
                <tr key={categoryId}>
                  <th className="sticky left-0 z-10 border-r-2 border-b border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-left font-semibold">
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0">
                        <span className="block max-w-[16rem] truncate" title={category?.name}>
                          {category?.name ?? "Unbekannte Kategorie"}
                        </span>
                        <span className="text-xs font-medium text-[var(--muted)]">
                          {category?.kind === "expense" ? "Ausgabe" : "Einnahme"}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => removeCategory(categoryId)}
                        className="rounded p-0.5 text-[var(--muted)] hover:bg-[var(--panel-muted)] hover:text-[var(--fg)]"
                        aria-label={`${category?.name ?? "Kategorie"} entfernen`}
                        title="Kategorie entfernen"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  </th>
                  {grid.months.map((m) => {
                    const key = cellKey(categoryId, m);
                    const amount = cellAmount(grid, categoryId, m);
                    const wrongSign =
                      !Number.isNaN(amount) &&
                      ((category?.kind === "expense" && amount > 0) ||
                        (category?.kind === "income" && amount < 0));
                    const isSelected =
                      selected?.categoryId === categoryId && selected.month === m;
                    return (
                      <td key={m} className="border-r border-b border-[var(--border)]/70 p-1">
                        <input
                          inputMode="decimal"
                          value={grid.cells[key] ?? ""}
                          placeholder="–"
                          aria-label={`${category?.name ?? "Kategorie"} ${monthLabel(m)}`}
                          onChange={(e) => {
                            const value = e.target.value;
                            // «=» fills the open remainder into this cell
                            if (value.trim().endsWith("=")) {
                              const without = value.trim().slice(0, -1);
                              const base = parseAmountInput(without) ?? 0;
                              const rest = Number.isNaN(base) ? open : roundCents(base + open);
                              setCell(categoryId, m, String(rest));
                              return;
                            }
                            setCell(categoryId, m, value);
                          }}
                          onFocus={(e) => {
                            setSelected({ categoryId, month: m });
                            e.currentTarget.select();
                          }}
                          title={
                            wrongSign
                              ? category?.kind === "expense"
                                ? "Ausgabe mit positivem Betrag?"
                                : "Einnahme mit negativem Betrag?"
                              : undefined
                          }
                          className={[
                            "w-full rounded-md border-2 px-2 py-1 text-right outline-none focus:border-[var(--accent)]",
                            Number.isNaN(amount)
                              ? "border-[var(--danger)] bg-red-50"
                              : wrongSign
                                ? "border-amber-400 bg-amber-50"
                                : isSelected
                                  ? "border-[var(--accent)]/40 bg-white"
                                  : "border-transparent bg-[#f6f6f6] focus:bg-white",
                          ].join(" ")}
                        />
                      </td>
                    );
                  })}
                  <td className="border-r border-b border-[var(--border)]/70" />
                  <td className="border-b border-l-2 border-[var(--border)]/70 bg-[var(--panel-muted)]/30 px-3 py-1.5 text-right font-semibold">
                    {formatChf(rowTotal(categoryId))}
                  </td>
                </tr>
              );
            })}
            <tr>
              <td className="sticky left-0 z-10 border-r-2 border-b border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2">
                <select
                  value=""
                  onChange={(e) => addCategory(e.target.value)}
                  aria-label="Kategorie hinzufügen"
                  className="w-full rounded-md border-2 border-dashed border-[var(--accent)] bg-[var(--accent-soft)]/40 px-2 py-1 text-sm font-semibold text-[var(--accent-hover)]"
                  disabled={unusedCategories.length === 0}
                >
                  <option value="">+ Kategorie</option>
                  {(["income", "expense"] as const).map((kind) => {
                    const options = unusedCategories.filter((c) => c.kind === kind);
                    if (options.length === 0) return null;
                    return (
                      <optgroup key={kind} label={kind === "income" ? "Einnahmen" : "Ausgaben"}>
                        {options.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </optgroup>
                    );
                  })}
                </select>
              </td>
              {/* Placeholder cells make clear that amounts go into a category row */}
              {grid.months.map((m) => (
                <td key={m} className="border-r border-b border-[var(--border)]/70 p-1">
                  <input
                    disabled
                    placeholder="Kategorie wählen"
                    aria-label={`Zuerst eine Kategorie wählen (${monthLabel(m)})`}
                    title="Zuerst links eine Kategorie wählen"
                    className="w-full cursor-not-allowed rounded-md border-2 border-dashed border-[var(--border)] bg-transparent px-2 py-1 text-right text-xs"
                  />
                </td>
              ))}
              <td colSpan={2} className="border-b border-[var(--border)]/70" />
            </tr>
          </tbody>
          {grid.categoryIds.length > 0 && grid.months.length > 0 ? (
            <tfoot>
              <tr className="font-semibold">
                <th className="sticky left-0 z-10 border-r-2 border-[var(--border)] bg-[var(--panel-muted)]/50 px-3 py-2 text-left">
                  Summe
                </th>
                {grid.months.map((m) => (
                  <td key={m} className="border-r border-[var(--border)]/70 bg-[var(--panel-muted)]/50 px-3 py-2 text-right">
                    {formatChf(colTotal(m))}
                  </td>
                ))}
                <td className="border-r border-[var(--border)]/70 bg-[var(--panel-muted)]/50" />
                <td className="border-l-2 border-[var(--border)] bg-[var(--panel-muted)] px-3 py-2 text-right">
                  {formatChf(total)}
                </td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>

      {grid.months.length === 0 || grid.categoryIds.length === 0 ? (
        <p className="px-5 py-4 text-sm text-[var(--muted)]">
          {grid.months.length === 0 && grid.categoryIds.length === 0
            ? "Noch leer: mit «+ Monat» eine Spalte und links eine Kategorie hinzufügen."
            : grid.months.length === 0
              ? "Noch kein Monat: oben mit «+ Monat» eine Spalte hinzufügen."
              : "Noch keine Kategorie: links in der Zeile «+ Kategorie» eine Kategorie wählen, dann Beträge eintragen."}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-4 border-t-2 border-[var(--border)] bg-[var(--panel-muted)]/40 px-5 py-4">
        {dirty ? <span className="mr-auto text-xs font-semibold text-amber-700">Ungespeicherte Änderungen</span> : null}
        {filledCells > 0 && open !== 0 ? (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={acceptDifference}
              onChange={(e) => setAcceptDifference(e.target.checked)}
            />
            Abweichung von {formatChfExact(-open)} bewusst übernehmen
          </label>
        ) : null}
        <button type="button" className="btn btn-primary" onClick={save} disabled={!canSave}>
          {pending ? "Speichere…" : "Speichern"}
        </button>
      </div>
    </section>
  );
}
