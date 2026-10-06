import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addCellMaps,
  monthKey,
  monthKeyFromDate,
  monthKeyToDate,
  parseAmountInput,
  sumCells,
} from "./shared";

describe("parseAmountInput", () => {
  it("parses Swiss formatting and shorthands", () => {
    assert.equal(parseAmountInput("12'500"), 12500);
    assert.equal(parseAmountInput("-5 000"), -5000);
    assert.equal(parseAmountInput("1234,50"), 1234.5);
    assert.equal(parseAmountInput("12.5k"), 12500);
    assert.equal(parseAmountInput("CHF 300"), 300);
  });

  it("returns null for empty and NaN for garbage", () => {
    assert.equal(parseAmountInput("  "), null);
    assert.ok(Number.isNaN(parseAmountInput("abc")));
    assert.ok(Number.isNaN(parseAmountInput("1-2")));
  });
});

describe("month keys", () => {
  it("round-trips through UTC dates", () => {
    const key = monthKey(2026, 0);
    assert.equal(key, "2026-01");
    assert.equal(monthKeyFromDate(monthKeyToDate(key)), key);
    assert.equal(monthKeyToDate("2026-12").toISOString(), "2026-12-01T00:00:00.000Z");
  });
});

describe("sumCells", () => {
  it("uses actual for closed months and forecast for open months", () => {
    const months = ["2026-01", "2026-02"];
    const cells = {
      "2026-01": { budget: 100, forecast: 90, actual: 80 },
      "2026-02": { budget: 100, forecast: 110, actual: 5 },
    };
    const totals = sumCells(cells, months, new Set(["2026-01"]));
    assert.deepEqual(totals, { budget: 200, forecast: 200, actual: 85, expected: 190 });
  });

  it("adds category maps for subtotals", () => {
    const months = ["2026-01"];
    const sum = addCellMaps(
      [{ "2026-01": { budget: 1, forecast: 2, actual: 3 } }, {}],
      months,
    );
    assert.deepEqual(sum["2026-01"], { budget: 1, forecast: 2, actual: 3 });
  });
});
