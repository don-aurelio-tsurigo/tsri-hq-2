import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cellKey, gridFromBookings, gridHasInvalid, gridToRows, gridTotal } from "./grid";

const order = ["tipp", "social", "publi"];

describe("gridFromBookings", () => {
  it("starts empty without bookings, using only explicit hints", () => {
    assert.deepEqual(gridFromBookings([], order, { month: null, categoryId: null }), {
      months: [],
      categoryIds: [],
      cells: {},
      existing: {},
    });
    const hinted = gridFromBookings([], order, { month: "2027-01", categoryId: "social" });
    assert.deepEqual(hinted.months, ["2027-01"]);
    assert.deepEqual(hinted.categoryIds, ["social"]);
  });

  it("places several categories in one month and sums duplicates", () => {
    const grid = gridFromBookings(
      [
        { id: "b1", month: "2027-02", categoryId: "social", title: "A", amount: 1000 },
        { id: "b2", month: "2027-01", categoryId: "tipp", title: "A", amount: 2000 },
        { id: "b3", month: "2027-01", categoryId: "social", title: "A", amount: 1500 },
        { id: "b4", month: "2027-01", categoryId: "social", title: "A", amount: 500 },
      ],
      order,
      { month: null, categoryId: null },
    );
    assert.deepEqual(grid.months, ["2027-01", "2027-02"]);
    assert.deepEqual(grid.categoryIds, ["tipp", "social"]);
    assert.equal(grid.cells[cellKey("social", "2027-01")], "2000");
    assert.equal(grid.existing[cellKey("social", "2027-01")].id, "b3");
    assert.equal(gridTotal(grid), 5000);
  });
});

describe("gridToRows", () => {
  it("turns non-empty cells into bookings and keeps existing ids", () => {
    const grid = {
      months: ["2027-01", "2027-02"],
      categoryIds: ["tipp", "social"],
      cells: {
        [cellKey("tipp", "2027-01")]: "2'000",
        [cellKey("social", "2027-01")]: "1.5k",
        [cellKey("social", "2027-02")]: "",
        [cellKey("tipp", "2027-02")]: "0",
      },
      existing: { [cellKey("tipp", "2027-01")]: { id: "b1", title: "Alt" } },
    };
    assert.deepEqual(gridToRows(grid, "Deal"), [
      { id: "b1", month: "2027-01", categoryId: "tipp", amount: 2000, title: "Alt" },
      { id: null, month: "2027-01", categoryId: "social", amount: 1500, title: "Deal" },
    ]);
    assert.equal(gridTotal(grid), 3500);
    assert.equal(gridHasInvalid(grid), false);
  });

  it("flags invalid input", () => {
    const grid = {
      months: ["2027-01"],
      categoryIds: ["tipp"],
      cells: { [cellKey("tipp", "2027-01")]: "abc" },
      existing: {},
    };
    assert.equal(gridHasInvalid(grid), true);
    assert.deepEqual(gridToRows(grid, "Deal"), []);
  });
});
