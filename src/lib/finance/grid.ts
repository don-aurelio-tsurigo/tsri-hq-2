/** Client-safe model for the deal split grid (category × month). */

import { parseAmountInput, roundCents, type MonthKey } from "./shared";

export type GridBooking = {
  id: string;
  month: MonthKey;
  categoryId: string;
  title: string;
  amount: number;
};

export type DealGrid = {
  months: MonthKey[];
  categoryIds: string[];
  /** cellKey → raw input string */
  cells: Record<string, string>;
  /** cellKey → existing booking reused on save (keeps id/title) */
  existing: Record<string, { id: string; title: string }>;
};

export const cellKey = (categoryId: string, month: MonthKey) => `${categoryId}|${month}`;

function inputFromAmount(n: number): string {
  return n === 0 ? "" : String(roundCents(n));
}

/**
 * Build the grid from a deal's bookings. Several bookings in the same cell
 * are summed; the first one is kept on save, the others get removed.
 */
export function gridFromBookings(
  bookings: GridBooking[],
  categoryOrder: string[],
  fallback: { month: MonthKey | null; categoryId: string | null },
): DealGrid {
  if (bookings.length === 0) {
    return {
      months: fallback.month ? [fallback.month] : [],
      categoryIds: fallback.categoryId ? [fallback.categoryId] : [],
      cells: {},
      existing: {},
    };
  }

  const sums = new Map<string, number>();
  const existing: DealGrid["existing"] = {};
  for (const b of bookings) {
    const key = cellKey(b.categoryId, b.month);
    sums.set(key, (sums.get(key) ?? 0) + b.amount);
    existing[key] ??= { id: b.id, title: b.title };
  }

  const rank = new Map(categoryOrder.map((id, i) => [id, i]));
  const categoryIds = [...new Set(bookings.map((b) => b.categoryId))].sort(
    (a, b) => (rank.get(a) ?? 1e9) - (rank.get(b) ?? 1e9),
  );
  const cells: DealGrid["cells"] = {};
  for (const [key, sum] of sums) cells[key] = inputFromAmount(sum);

  return {
    months: [...new Set(bookings.map((b) => b.month))].sort(),
    categoryIds,
    cells,
    existing,
  };
}

/** Parsed amount of a cell: 0 for empty, NaN for invalid input. */
export function cellAmount(grid: DealGrid, categoryId: string, month: MonthKey): number {
  const raw = grid.cells[cellKey(categoryId, month)] ?? "";
  return parseAmountInput(raw) ?? 0;
}

export function gridTotal(grid: DealGrid): number {
  let total = 0;
  for (const c of grid.categoryIds) {
    for (const m of grid.months) {
      const n = cellAmount(grid, c, m);
      if (!Number.isNaN(n)) total += n;
    }
  }
  return roundCents(total);
}

export function gridHasInvalid(grid: DealGrid): boolean {
  return grid.categoryIds.some((c) => grid.months.some((m) => Number.isNaN(cellAmount(grid, c, m))));
}

/** Every non-empty cell becomes one booking. */
export function gridToRows(grid: DealGrid, defaultTitle: string) {
  const rows: {
    id: string | null;
    month: MonthKey;
    categoryId: string;
    amount: number;
    title: string;
  }[] = [];
  for (const m of grid.months) {
    for (const c of grid.categoryIds) {
      const amount = cellAmount(grid, c, m);
      if (amount === 0 || Number.isNaN(amount)) continue;
      const prev = grid.existing[cellKey(c, m)];
      rows.push({
        id: prev?.id ?? null,
        month: m,
        categoryId: c,
        amount: roundCents(amount),
        title: prev?.title ?? defaultTitle,
      });
    }
  }
  return rows;
}
