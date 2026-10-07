"use client";

import { Fragment, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { ExternalLink, Lock, LockOpen, Pencil, Plus, Trash2, X } from "lucide-react";
import { FinanceCompanyCombobox } from "@/components/finance-company-combobox";
import { FinanceMonthPicker } from "@/components/finance-month-picker";
import { useToast } from "@/components/toast";
import { FinanceNewYearDialog } from "@/components/finance-new-year-dialog";
import {
  deleteFinanceBooking,
  loadFinanceCellBookings,
  saveFinanceBooking,
  saveFinanceBudgetCell,
  toggleFinanceMonthClosed,
} from "@/lib/actions/finance";
import type { BudgetOverview, CellBooking, OverviewCategory } from "@/lib/finance/budget";
import type { CompanyInput, CompanyOption } from "@/lib/finance/companies";
import {
  EMPTY_CELL,
  MONTH_LABELS,
  MONTH_SHORT,
  addCellMaps,
  formatChf,
  formatChfExact,
  monthKey,
  monthLabel,
  parseAmountInput,
  parseMonthKey,
  sumCells,
  validityLabel,
  type CellValues,
  type FinanceKind,
  type MonthKey,
} from "@/lib/finance/shared";

type Metric = "budget" | "forecast" | "actual";
type MetricView = "all" | Metric;

const METRIC_LABEL: Record<Metric, string> = {
  budget: "Budget",
  forecast: "Forecast",
  actual: "Effektiv",
};

const KIND_LABEL: Record<FinanceKind, string> = {
  income: "Einnahmen",
  expense: "Ausgaben",
};

type CellMap = Record<MonthKey, CellValues | undefined>;

type EditTarget = { categoryId: string; month: MonthKey; field: "budget" | "forecast" };

type Drilldown = {
  category: OverviewCategory;
  months: MonthKey[];
  label: string;
  bookings: CellBooking[] | null;
};

type Row =
  | { type: "section"; key: string; label: string }
  | { type: "category"; key: string; category: OverviewCategory; cells: CellMap }
  | { type: "subtotal"; key: string; label: string; cells: CellMap }
  | { type: "total"; key: string; label: string; cells: CellMap; strong?: boolean };

export function FinanceBudgetOverview({
  overview,
  companies,
}: {
  overview: BudgetOverview;
  companies: CompanyOption[];
}) {
  const { showToast } = useToast();
  const [cells, setCells] = useState(overview.cells);
  const [closed, setClosed] = useState(() => new Set(overview.closedMonths));
  const [view, setView] = useState<MetricView>("all");
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const [drilldown, setDrilldown] = useState<Drilldown | null>(null);
  const [newYearOpen, setNewYearOpen] = useState(false);
  const [, startTransition] = useTransition();

  // Server revalidation brings fresh data; drop local optimistic state.
  const [syncedOverview, setSyncedOverview] = useState(overview);
  if (syncedOverview !== overview) {
    setSyncedOverview(overview);
    setCells(overview.cells);
    setClosed(new Set(overview.closedMonths));
  }

  const months = overview.months;
  const metrics: Metric[] = view === "all" ? ["budget", "forecast", "actual"] : [view];
  const now = new Date();
  const currentMonth = monthKey(now.getFullYear(), now.getMonth());

  const rows = useMemo(
    () => buildRows(overview.categories, cells, months),
    [overview.categories, cells, months],
  );

  function saveCell(target: EditTarget, raw: string) {
    setEditing(null);
    const parsed = parseAmountInput(raw);
    const value = parsed ?? 0;
    if (Number.isNaN(value)) {
      showToast({ message: `«${raw}» ist kein gültiger Betrag.` });
      return;
    }
    const previous = cells[target.categoryId]?.[target.month] ?? EMPTY_CELL;
    if (previous[target.field] === value) return;

    setCells((prev) => withCell(prev, target, value));
    startTransition(async () => {
      const result = await saveFinanceBudgetCell({ ...target, value });
      if ("error" in result) {
        setCells((prev) => withCell(prev, target, previous[target.field]));
        showToast({ message: result.error });
      }
    });
  }

  function toggleClosed(month: MonthKey) {
    const nextClosed = !closed.has(month);
    setClosed((prev) => {
      const next = new Set(prev);
      if (nextClosed) next.add(month);
      else next.delete(month);
      return next;
    });
    startTransition(async () => {
      const result = await toggleFinanceMonthClosed({ month, closed: nextClosed });
      if ("error" in result) {
        showToast({ message: result.error });
        return;
      }
      showToast({
        message: `${monthLabel(month)} ${nextClosed ? "abgeschlossen" : "wieder geöffnet"}.`,
      });
    });
  }

  function openDrilldown(category: OverviewCategory, monthsToShow: MonthKey[], label: string) {
    setDrilldown({ category, months: monthsToShow, label, bookings: null });
    startTransition(async () => {
      try {
        const bookings = await loadFinanceCellBookings({
          categoryId: category.id,
          months: monthsToShow,
        });
        setDrilldown((d) =>
          d && d.category.id === category.id && d.label === label ? { ...d, bookings } : d,
        );
      } catch {
        showToast({ message: "Buchungen konnten nicht geladen werden." });
      }
    });
  }

  const yearMetrics: (Metric | "expected")[] = [...metrics, "expected"];
  const colsPerMonth = metrics.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap gap-1" aria-label="Jahr">
          {overview.years.map((y) => (
            <Link
              key={y}
              href={`/finance?jahr=${y}`}
              className={[
                "rounded-lg px-3 py-1.5 text-sm font-semibold",
                y === overview.year
                  ? "bg-[var(--fg)] !text-white"
                  : "text-[var(--muted)] hover:bg-[var(--panel-muted)]",
              ].join(" ")}
            >
              {y}
            </Link>
          ))}
          <button
            type="button"
            onClick={() => setNewYearOpen(true)}
            className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-semibold text-[var(--accent)] hover:bg-[var(--accent-soft)]"
            title="Neues Budgetjahr anlegen"
          >
            <Plus className="size-3.5" /> {Math.max(...overview.years) + 1}
          </button>
        </nav>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Spalten">
          {(["all", "budget", "forecast", "actual"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              aria-pressed={view === v}
              className={[
                "rounded-lg px-3 py-1.5 text-sm font-semibold",
                view === v
                  ? "bg-[var(--accent)] text-white"
                  : "text-[var(--muted)] hover:bg-[var(--panel-muted)]",
              ].join(" ")}
            >
              {v === "all" ? "Alle" : METRIC_LABEL[v]}
            </button>
          ))}
        </div>
      </div>

      {overview.categories.length === 0 ? (
        <div className="card p-8 text-center text-sm text-[var(--muted)]">
          Noch keine Kategorien. Import aus Airtable mit{" "}
          <code className="rounded bg-[var(--panel-muted)] px-1.5 py-0.5">
            npm run finance:airtable-import
          </code>
          .
        </div>
      ) : (
        <div className="card max-h-[calc(100svh-13rem)] overflow-auto">
          <table className="border-separate border-spacing-0 text-sm tabular-nums">
            <thead>
              <tr>
                <th
                  rowSpan={2}
                  className="sticky top-0 left-0 z-30 w-[9.5rem] min-w-[9.5rem] sm:w-auto sm:min-w-[16rem] border-r-2 border-b-2 border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-left font-semibold"
                >
                  Kategorie
                </th>
                {months.map((m) => {
                  const isClosed = closed.has(m);
                  const [, mi] = parseMonthKey(m);
                  return (
                    <th
                      key={m}
                      colSpan={colsPerMonth}
                      className={[
                        "sticky top-0 z-20 h-10 border-r border-b border-[var(--border)] px-2 text-left font-semibold whitespace-nowrap",
                        m === currentMonth ? "bg-[var(--accent-soft)]" : isClosed ? "bg-[#f3f3f3]" : "bg-[var(--bg-elevated)]",
                      ].join(" ")}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span title={MONTH_LABELS[mi]}>{MONTH_SHORT[mi]}</span>
                        <button
                          type="button"
                          onClick={() => toggleClosed(m)}
                          title={isClosed ? "Monat abgeschlossen – wieder öffnen" : "Monat abschliessen"}
                          aria-label={isClosed ? `${monthLabel(m)} wieder öffnen` : `${monthLabel(m)} abschliessen`}
                          className={[
                            "rounded p-0.5",
                            isClosed ? "text-emerald-700" : "text-[var(--border)] hover:text-[var(--muted)]",
                          ].join(" ")}
                        >
                          {isClosed ? <Lock className="size-3.5" /> : <LockOpen className="size-3.5" />}
                        </button>
                      </div>
                    </th>
                  );
                })}
                <th
                  colSpan={yearMetrics.length}
                  className="sticky top-0 z-20 h-10 border-b border-l-2 border-[var(--border)] bg-[var(--panel-muted)] px-2 text-left font-semibold"
                >
                  Jahr {overview.year}
                </th>
              </tr>
              <tr>
                {months.map((m) =>
                  metrics.map((metric, i) => (
                    <th
                      key={`${m}-${metric}`}
                      className={[
                        "sticky top-10 z-20 border-b-2 border-[var(--border)] px-2 py-1 text-right text-xs font-semibold text-[var(--muted)] whitespace-nowrap",
                        i === metrics.length - 1 ? "border-r" : "",
                        m === currentMonth ? "bg-[var(--accent-soft)]" : closed.has(m) ? "bg-[#f3f3f3]" : "bg-[var(--bg-elevated)]",
                      ].join(" ")}
                    >
                      {METRIC_LABEL[metric]}
                    </th>
                  )),
                )}
                {yearMetrics.map((metric, i) => (
                  <th
                    key={`year-${metric}`}
                    className={[
                      "sticky top-10 z-20 border-b-2 border-[var(--border)] bg-[var(--panel-muted)] px-2 py-1 text-right text-xs font-semibold whitespace-nowrap",
                      i === 0 ? "border-l-2" : "",
                    ].join(" ")}
                    title={
                      metric === "expected"
                        ? "Abgeschlossene Monate mit Effektiv, offene mit Forecast"
                        : undefined
                    }
                  >
                    {metric === "expected" ? "Erwartet" : METRIC_LABEL[metric]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                if (row.type === "section") {
                  return (
                    <tr key={row.key}>
                      <th
                        className="sticky left-0 z-10 border-r-2 border-b border-[var(--border)] bg-[var(--fg)] px-3 py-1.5 text-left text-xs font-bold tracking-wider text-white uppercase"
                      >
                        {row.label}
                      </th>
                      <td
                        colSpan={months.length * colsPerMonth + yearMetrics.length}
                        className="border-b border-[var(--border)] bg-[var(--fg)]"
                      />
                    </tr>
                  );
                }

                const totals = sumCells(row.cells, months, closed);
                const isCategory = row.type === "category";
                const rowTone =
                  row.type === "total"
                    ? row.strong
                      ? "bg-[var(--highlight-soft)] font-bold"
                      : "bg-[var(--panel-muted)]/50 font-semibold"
                    : row.type === "subtotal"
                      ? "text-[var(--muted)] italic"
                      : "";

                return (
                  <tr key={row.key} className={["group", rowTone].join(" ")}>
                    <th
                      className={[
                        "sticky left-0 z-10 max-w-[9.5rem] sm:max-w-[20rem] border-r-2 border-b border-[var(--border)] px-3 py-1.5 text-left font-[inherit] whitespace-nowrap",
                        row.type === "total" && row.strong
                          ? "bg-[var(--highlight-soft)]"
                          : row.type === "total"
                            ? "bg-[#e9e9e9]"
                            : "bg-[var(--bg-elevated)] group-hover:bg-[#f6f6f6]",
                      ].join(" ")}
                    >
                      <span className="block truncate" title={isCategory ? row.category.name : row.label}>
                        {isCategory ? row.category.name : row.label}
                      </span>
                      {isCategory && row.category.inactive ? (
                        <span
                          className="block text-xs font-medium text-amber-700"
                          title="In diesem Jahr eigentlich nicht aktiv, hat aber Zahlen"
                        >
                          {validityLabel(row.category) ?? "nicht aktiv"} · hat Zahlen
                        </span>
                      ) : null}
                    </th>
                    {months.map((m) =>
                      metrics.map((metric, i) => {
                        const value = row.cells[m]?.[metric] ?? 0;
                        const borderR = i === metrics.length - 1 ? "border-r" : "";
                        const tint =
                          m === currentMonth
                            ? "bg-[var(--accent-soft)]/40"
                            : closed.has(m)
                              ? "bg-[#f7f7f7]"
                              : "";
                        const base = `border-b border-[var(--border)]/70 ${borderR} ${tint}`;

                        if (isCategory && metric !== "actual") {
                          const isEditing =
                            editing?.categoryId === row.category.id &&
                            editing.month === m &&
                            editing.field === metric;
                          return (
                            <td key={`${m}-${metric}`} className={`${base} p-0`}>
                              {isEditing ? (
                                <input
                                  autoFocus
                                  defaultValue={value === 0 ? "" : String(value)}
                                  inputMode="decimal"
                                  aria-label={`${METRIC_LABEL[metric]} ${row.category.name} ${monthLabel(m)}`}
                                  className="w-24 min-w-full bg-white px-2 py-1.5 text-right outline-2 outline-[var(--accent)]"
                                  onFocus={(e) => e.currentTarget.select()}
                                  onBlur={(e) => {
                                    if (e.currentTarget.dataset.cancel) {
                                      setEditing(null);
                                      return;
                                    }
                                    saveCell(
                                      { categoryId: row.category.id, month: m, field: metric },
                                      e.currentTarget.value,
                                    );
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") e.currentTarget.blur();
                                    if (e.key === "Escape") {
                                      e.currentTarget.dataset.cancel = "1";
                                      e.currentTarget.blur();
                                    }
                                  }}
                                />
                              ) : (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setEditing({ categoryId: row.category.id, month: m, field: metric })
                                  }
                                  title={`${METRIC_LABEL[metric]} bearbeiten`}
                                  className="block w-full min-w-[5.5rem] px-2 py-1.5 text-right hover:bg-[var(--accent-soft)]"
                                >
                                  <Amount value={value} />
                                </button>
                              )}
                            </td>
                          );
                        }

                        if (isCategory && metric === "actual") {
                          return (
                            <td key={`${m}-${metric}`} className={`${base} p-0`}>
                              <button
                                type="button"
                                onClick={() => openDrilldown(row.category, [m], monthLabel(m))}
                                title="Buchungen anzeigen"
                                className="block w-full min-w-[5.5rem] px-2 py-1.5 text-right font-semibold underline-offset-2 hover:bg-[var(--accent-soft)] hover:underline"
                              >
                                <Amount value={value} />
                              </button>
                            </td>
                          );
                        }

                        return (
                          <td key={`${m}-${metric}`} className={`${base} min-w-[5.5rem] px-2 py-1.5 text-right`}>
                            <Amount value={value} />
                          </td>
                        );
                      }),
                    )}
                    {yearMetrics.map((metric, i) => {
                      const value = totals[metric];
                      const cls = [
                        "min-w-[6.5rem] border-b border-[var(--border)]/70 px-2 py-1.5 text-right font-semibold",
                        i === 0 ? "border-l-2" : "",
                        metric === "expected" ? "bg-[var(--panel-muted)]/40" : "",
                      ].join(" ");
                      if (isCategory && metric === "actual") {
                        return (
                          <td key={`year-${metric}`} className={`${cls} p-0`}>
                            <button
                              type="button"
                              onClick={() =>
                                openDrilldown(row.category, months, `Jahr ${overview.year}`)
                              }
                              title="Alle Buchungen des Jahres anzeigen"
                              className="block w-full px-2 py-1.5 text-right underline-offset-2 hover:bg-[var(--accent-soft)] hover:underline"
                            >
                              <Amount value={value} />
                            </button>
                          </td>
                        );
                      }
                      return (
                        <td key={`year-${metric}`} className={cls}>
                          <Amount value={value} />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-[var(--muted)]">
        Einnahmen positiv, Ausgaben negativ. Budget und Forecast per Klick bearbeiten (z.B. «12&apos;500»
        oder «12.5k»). Effektiv ist die Summe der Buchungen – Klick zeigt die Buchungen dahinter.
        «Erwartet» rechnet abgeschlossene Monate (Schloss) mit Effektiv, offene mit Forecast.
      </p>

      {newYearOpen ? (
        <FinanceNewYearDialog
          year={Math.max(...overview.years) + 1}
          onClose={() => setNewYearOpen(false)}
        />
      ) : null}

      {drilldown ? (
        <BookingsDrawer
          drilldown={drilldown}
          categories={overview.categories}
          companies={companies}
          onClose={() => setDrilldown(null)}
          onChanged={() => openDrilldown(drilldown.category, drilldown.months, drilldown.label)}
        />
      ) : null}
    </div>
  );
}

function Amount({ value }: { value: number }) {
  if (value === 0) return <span className="text-[var(--border)]">–</span>;
  return <span title={formatChfExact(value)}>{formatChf(value)}</span>;
}

function withCell(
  prev: BudgetOverview["cells"],
  target: EditTarget,
  value: number,
): BudgetOverview["cells"] {
  const byMonth = prev[target.categoryId] ?? {};
  const current = byMonth[target.month] ?? EMPTY_CELL;
  return {
    ...prev,
    [target.categoryId]: {
      ...byMonth,
      [target.month]: { ...current, [target.field]: value },
    },
  };
}

function buildRows(
  categories: OverviewCategory[],
  cells: BudgetOverview["cells"],
  months: MonthKey[],
): Row[] {
  const rows: Row[] = [];
  const kindTotals: CellMap[] = [];

  for (const kind of ["income", "expense"] as const) {
    const inKind = categories.filter((c) => c.kind === kind);
    if (inKind.length === 0) continue;

    rows.push({ type: "section", key: `section-${kind}`, label: KIND_LABEL[kind] });
    for (const category of inKind) {
      rows.push({
        type: "category",
        key: category.id,
        category,
        cells: cells[category.id] ?? {},
      });
    }

    const groups = [...new Set(inKind.map((c) => c.group).filter((g): g is string => !!g))];
    for (const group of groups) {
      rows.push({
        type: "subtotal",
        key: `group-${kind}-${group}`,
        label: `davon ${group}`,
        cells: addCellMaps(
          inKind.filter((c) => c.group === group).map((c) => cells[c.id] ?? {}),
          months,
        ),
      });
    }

    const total = addCellMaps(
      inKind.map((c) => cells[c.id] ?? {}),
      months,
    );
    kindTotals.push(total);
    rows.push({ type: "total", key: `total-${kind}`, label: `Total ${KIND_LABEL[kind]}`, cells: total });
  }

  if (kindTotals.length > 1) {
    rows.push({
      type: "total",
      key: "result",
      label: "Ergebnis",
      cells: addCellMaps(kindTotals, months),
      strong: true,
    });
  }
  return rows;
}

function BookingsDrawer({
  drilldown,
  categories,
  companies,
  onClose,
  onChanged,
}: {
  drilldown: Drilldown;
  categories: OverviewCategory[];
  companies: CompanyOption[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const { bookings } = drilldown;
  const total = bookings?.reduce((s, b) => s + b.amount, 0) ?? 0;
  const multiMonth = drilldown.months.length > 1;
  /** booking id being edited, "new" for a new booking */
  const [editing, setEditing] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (e.key !== "Escape" || target?.closest("form")) return;
      onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function done() {
    setEditing(null);
    onChanged();
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex justify-end bg-black/35"
      role="dialog"
      aria-modal="true"
      aria-labelledby="finance-drawer-title"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-xl flex-col bg-[var(--bg-elevated)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b-2 border-[var(--border)] p-5">
          <div className="min-w-0">
            <p className="text-sm font-semibold tracking-wide text-[var(--accent)] uppercase">
              Effektiv · {drilldown.label}
            </p>
            <h2
              id="finance-drawer-title"
              className="mt-1 font-[family-name:var(--font-display)] text-xl font-semibold"
            >
              {drilldown.category.name}
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {editing !== "new" ? (
              <button
                type="button"
                onClick={() => setEditing("new")}
                className="btn btn-ghost inline-flex items-center gap-1 px-2 py-1.5 text-sm"
              >
                <Plus className="size-4" /> Buchung
              </button>
            ) : null}
            <button type="button" onClick={onClose} className="btn btn-ghost p-2" aria-label="Schliessen">
              <X className="size-5" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {editing === "new" ? (
            <div className="mb-4 rounded-lg border-2 border-[var(--accent)] p-4">
              <p className="mb-3 text-sm font-semibold">Neue Buchung</p>
              <BookingForm
                categories={categories}
                companies={companies}
                initial={{
                  id: null,
                  title: "",
                  amount: "",
                  month: drilldown.months[drilldown.months.length === 1 ? 0 : drilldown.months.length - 1],
                  categoryId: drilldown.category.id,
                  company: null,
                  notes: "",
                }}
                onCancel={() => setEditing(null)}
                onDone={done}
              />
            </div>
          ) : null}
          {bookings === null ? (
            <p className="text-sm text-[var(--muted)]">Lade Buchungen…</p>
          ) : bookings.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">Keine Buchungen in diesem Zeitraum.</p>
          ) : (
            <ul className="divide-y divide-[var(--border)]/70">
              {bookings.map((b, i) => (
                <Fragment key={b.id}>
                  {multiMonth && (i === 0 || bookings[i - 1].month !== b.month) ? (
                    <li className="pt-4 pb-1 text-xs font-bold tracking-wider text-[var(--muted)] uppercase first:pt-0">
                      {monthLabel(b.month)}
                    </li>
                  ) : null}
                  {editing === b.id ? (
                    <li className="py-3">
                      <BookingForm
                        categories={categories}
                        companies={companies}
                        initial={{
                          id: b.id,
                          title: b.title,
                          amount: String(b.amount),
                          month: b.month,
                          categoryId: drilldown.category.id,
                          company: b.company,
                          notes: b.notes ?? "",
                        }}
                        onCancel={() => setEditing(null)}
                        onDone={done}
                      />
                    </li>
                  ) : (
                    <li className="flex items-start justify-between gap-4 py-3">
                      <div className="min-w-0">
                        <p className="font-semibold">{b.title}</p>
                        <p className="mt-0.5 text-xs text-[var(--muted)]">
                          {b.company ? (
                            <Link href={`/finance/organisationen/${b.company.id}`} className="hover:underline">
                              {b.company.name}
                            </Link>
                          ) : null}
                          {b.company && b.responsibleName ? " · " : null}
                          {b.responsibleName}
                          {!b.company && !b.responsibleName ? "—" : null}
                        </p>
                        {b.deal ? (
                          <p className="mt-1 text-xs">
                            <Link
                              href={`/finance/deals/${b.deal.id}`}
                              className="badge badge-muted hover:underline"
                              title="Deal öffnen und Raten bearbeiten"
                            >
                              Deal «{b.deal.title}»
                              {b.deal.bookingCount > 1 ? ` · ${b.deal.bookingCount} Raten` : ""} →
                            </Link>
                          </p>
                        ) : null}
                        {b.notes ? (
                          <p className="mt-1 text-xs whitespace-pre-line text-[var(--muted)]">{b.notes}</p>
                        ) : null}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-semibold tabular-nums">{formatChfExact(b.amount)}</p>
                        <div className="mt-1 flex items-center justify-end gap-2 text-xs">
                          {b.bexioUrl ? (
                            <a
                              href={b.bexioUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 font-semibold text-[var(--accent)] hover:underline"
                            >
                              Bexio <ExternalLink className="size-3" />
                            </a>
                          ) : null}
                          {!b.deal ? (
                            <button
                              type="button"
                              onClick={() => setEditing(b.id)}
                              className="inline-flex items-center gap-1 font-semibold text-[var(--muted)] hover:text-[var(--fg)]"
                            >
                              <Pencil className="size-3" /> Bearbeiten
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  )}
                </Fragment>
              ))}
            </ul>
          )}
        </div>

        {bookings && bookings.length > 0 ? (
          <div className="flex items-center justify-between border-t-2 border-[var(--border)] px-5 py-4 font-semibold">
            <span>
              {bookings.length} Buchung{bookings.length === 1 ? "" : "en"}
            </span>
            <span className="tabular-nums">{formatChfExact(total)}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

type BookingFormValues = {
  id: string | null;
  title: string;
  amount: string;
  month: MonthKey;
  categoryId: string;
  company: CompanyInput;
  notes: string;
};

function BookingForm({
  initial,
  categories,
  companies,
  onCancel,
  onDone,
}: {
  initial: BookingFormValues;
  categories: OverviewCategory[];
  companies: CompanyOption[];
  onCancel: () => void;
  onDone: () => void;
}) {
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState(initial);
  const set = (patch: Partial<BookingFormValues>) => setValues((v) => ({ ...v, ...patch }));
  const idPrefix = `booking-${initial.id ?? "new"}`;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseAmountInput(values.amount);
    if (amount === null || Number.isNaN(amount)) {
      showToast({ message: "Ungültiger Betrag." });
      return;
    }
    startTransition(async () => {
      const result = await saveFinanceBooking({ ...values, amount });
      if ("error" in result) {
        showToast({ message: result.error });
        return;
      }
      showToast({ message: initial.id ? "Buchung gespeichert." : "Buchung erfasst." });
      onDone();
    });
  }

  function remove() {
    if (!initial.id || !window.confirm("Buchung löschen?")) return;
    const id = initial.id;
    startTransition(async () => {
      const result = await deleteFinanceBooking(id);
      if ("error" in result) {
        showToast({ message: result.error });
        return;
      }
      showToast({ message: "Buchung gelöscht." });
      onDone();
    });
  }

  return (
    <form
      onSubmit={submit}
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
      }}
      className="grid grid-cols-2 gap-3"
    >
      <div className="field col-span-2">
        <label htmlFor={`${idPrefix}-title`}>Titel</label>
        <input
          id={`${idPrefix}-title`}
          autoFocus
          required
          value={values.title}
          onChange={(e) => set({ title: e.target.value })}
        />
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-amount`}>Betrag (CHF)</label>
        <input
          id={`${idPrefix}-amount`}
          required
          inputMode="decimal"
          placeholder="Ausgaben negativ"
          value={values.amount}
          onChange={(e) => set({ amount: e.target.value })}
        />
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-month`}>Monat</label>
        <FinanceMonthPicker
          idPrefix={idPrefix}
          label="Monat der Buchung"
          value={values.month}
          onChange={(month) => set({ month })}
        />
      </div>
      <div className="field col-span-2">
        <label htmlFor={`${idPrefix}-category`}>Kategorie</label>
        <select
          id={`${idPrefix}-category`}
          value={values.categoryId}
          onChange={(e) => set({ categoryId: e.target.value })}
        >
          {(["income", "expense"] as const).map((kind) => (
            <optgroup key={kind} label={KIND_LABEL[kind]}>
              {categories
                .filter((c) => c.kind === kind)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </div>
      <div className="field col-span-2">
        <label htmlFor={`${idPrefix}-org`}>Organisation</label>
        <FinanceCompanyCombobox
          inputId={`${idPrefix}-org`}
          companies={companies}
          value={values.company}
          onChange={(company) => set({ company })}
        />
      </div>
      <div className="field col-span-2">
        <label htmlFor={`${idPrefix}-notes`}>Notizen</label>
        <textarea
          id={`${idPrefix}-notes`}
          rows={2}
          value={values.notes}
          onChange={(e) => set({ notes: e.target.value })}
        />
      </div>
      <div className="col-span-2 flex items-center gap-2">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          Speichern
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Abbrechen
        </button>
        {initial.id ? (
          <button
            type="button"
            className="btn btn-ghost ml-auto inline-flex items-center gap-1 text-[var(--danger)]"
            onClick={remove}
            disabled={pending}
          >
            <Trash2 className="size-4" /> Löschen
          </button>
        ) : null}
      </div>
    </form>
  );
}
