import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addCellMaps,
  addMonths,
  monthKey,
  monthKeyFromDate,
  monthKeyToDate,
  parseAmountInput,
  parseLooseAmount,
  parseLooseMonth,
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

describe("addMonths", () => {
  it("rolls over years in both directions", () => {
    assert.equal(addMonths("2026-11", 3), "2027-02");
    assert.equal(addMonths("2026-01", -1), "2025-12");
  });
});

describe("webhook parsing", () => {
  it("parses loose amounts", () => {
    assert.equal(parseLooseAmount(12000), 12000);
    assert.equal(parseLooseAmount("12'000.50"), 12000.5);
    assert.equal(parseLooseAmount("1,200.00"), 1200);
    assert.equal(parseLooseAmount("1200,50"), 1200.5);
    assert.equal(parseLooseAmount("CHF 300"), 300);
    assert.equal(parseLooseAmount("abc"), null);
    assert.equal(parseLooseAmount(null), null);
  });

  it("parses loose months", () => {
    assert.equal(parseLooseMonth("2027-03"), "2027-03");
    assert.equal(parseLooseMonth("2027-03-15T00:00:00Z"), "2027-03");
    assert.equal(parseLooseMonth("15.03.2027"), "2027-03");
    assert.equal(parseLooseMonth("2027-13"), null);
    assert.equal(parseLooseMonth("März"), null);
  });
});
