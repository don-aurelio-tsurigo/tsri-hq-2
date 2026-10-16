import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  activeAssignment,
  assignmentRangeError,
  calculateCommission,
  commissionPeriodOf,
  commissionPeriodRange,
  commissionPeriodRangeLabel,
  commissionPeriodsBetween,
  commissionSplitDiff,
  sumDealsByPeriod,
  type CommissionModelParams,
} from "./commission";

const STANDARD: CommissionModelParams = {
  baseAmount: 500,
  externRate: 0.25,
  internRateMin: 0.15,
  internRateMax: 0.45,
  threshold: 10_000,
  progressionBasis: "intern",
};

const VALENTINA: CommissionModelParams = {
  baseAmount: 2000,
  externRate: 0.25,
  internRateMin: 0.15,
  internRateMax: 0.35,
  threshold: 10_000,
  progressionBasis: "total",
};

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("commissionPeriodOf", () => {
  it("counts up to the 20th to the same month", () => {
    assert.equal(commissionPeriodOf(d("2026-10-01")), "2026-10");
    assert.equal(commissionPeriodOf(d("2026-10-20")), "2026-10");
  });
  it("counts from the 21st to the next month", () => {
    assert.equal(commissionPeriodOf(d("2026-10-21")), "2026-11");
    assert.equal(commissionPeriodOf(d("2026-12-31")), "2027-01");
  });
});

describe("commissionPeriodRange", () => {
  it("runs from the 21st of the previous month to the 20th", () => {
    const { from, to } = commissionPeriodRange("2026-01");
    assert.equal(from.toISOString().slice(0, 10), "2025-12-21");
    assert.equal(to.toISOString().slice(0, 10), "2026-01-20");
    assert.equal(commissionPeriodRangeLabel("2026-10"), "21.09.–20.10.2026");
  });
  it("lists periods inclusively", () => {
    assert.deepEqual(commissionPeriodsBetween("2026-11", "2027-02"), [
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
    ]);
  });
});

describe("calculateCommission", () => {
  // Monatsabrechnungen aus Airtable: [ID, Summe Tsüri, Summe Extern, «Provision regulär», «Provision Valentina 2026»]
  const AIRTABLE: [string, number, number, number, number][] = [
    ["Emilio - 02-2026", 0, 0, 500, 2000],
    ["Marc - 02-2026", 5250, 0, 2114.38, 3338.75],
    ["Marc - 03-2026", 5325, 0, 2149.42, 3365.86],
    ["Marc - 04-2026", 0, 650, 662.5, 2162.5],
    ["Marc - 05-2026", 1500, 0, 792.5, 2270],
    ["Marc - 06-2026", 6900, 0, 2963.3, 3987.2],
    ["Marc - 09-2026", 4625, 0, 1835.47, 3121.56],
    ["Marc - 10-2026", 1500, 0, 792.5, 2270],
    ["Timothy - 03-2026", 1837.5, 0, 876.92, 2343.15],
    ["Valentina - 02-2026", 8160, 3360, 5012, 5696],
    ["Valentina - 03-2026", 10145, 0, 5065.25, 5550.75],
    ["Valentina - 04-2026", 42562, 3150, 20440.4, 17684.2],
    ["Valentina - 05-2026", 39460, 0, 18257, 15811],
    ["Valentina - 06-2026", 27076.5, 0, 12684.43, 11476.78],
    ["Valentina - 07-2026", 10450, 0, 5202.5, 5657.5],
    ["Valentina - 08-2026", 19000, 880, 9270, 8870],
    ["Valentina - 09-2026", 15000, 0, 7250, 7250],
    ["Valentina - 10-2026", 6675, 0, 2837.92, 3892.36],
  ];

  for (const [id, intern, extern, standard, valentina] of AIRTABLE) {
    it(`matches Airtable for ${id}`, () => {
      assert.equal(calculateCommission(STANDARD, intern, extern).amount, standard);
      assert.equal(calculateCommission(VALENTINA, intern, extern).amount, valentina);
    });
  }

  it("applies the maximum rate above the threshold", () => {
    const r = calculateCommission(STANDARD, 9000, 2000);
    assert.equal(r.internRate, 0.45);
    assert.equal(r.amount, 500 + 4050 + 500);
  });

  it("works without base amount", () => {
    assert.equal(calculateCommission({ ...STANDARD, baseAmount: 0 }, 0, 0).amount, 0);
  });
});

describe("assignments", () => {
  const a = [
    { id: "std", validFrom: "2026-01", validUntil: "2026-06" },
    { id: "val", validFrom: "2026-07", validUntil: null },
  ];

  it("finds the assignment valid in a period", () => {
    assert.equal(activeAssignment(a, "2025-12"), null);
    assert.equal(activeAssignment(a, "2026-06")?.id, "std");
    assert.equal(activeAssignment(a, "2026-07")?.id, "val");
    assert.equal(activeAssignment(a, "2030-01")?.id, "val");
  });

  it("detects overlaps and inverted ranges", () => {
    assert.equal(assignmentRangeError(a), null);
    assert.match(
      assignmentRangeError([...a, { validFrom: "2026-03", validUntil: "2026-04" }]) ?? "",
      /überschneiden/,
    );
    assert.match(
      assignmentRangeError([{ validFrom: "2026-05", validUntil: "2026-04" }]) ?? "",
      /vor/,
    );
  });
});

describe("deals", () => {
  it("reports split differences", () => {
    assert.equal(commissionSplitDiff(1000, { intern: 700, extern: 300 }), 0);
    assert.equal(commissionSplitDiff(1000, { intern: 700, extern: 200 }), -100);
  });

  it("sums deals per period", () => {
    const sums = sumDealsByPeriod([
      { soldAt: d("2026-09-18"), intern: 3000, extern: 0 },
      { soldAt: d("2026-09-17"), intern: 450, extern: 0 },
      { soldAt: d("2026-09-21"), intern: 1000, extern: 500 },
    ]);
    assert.deepEqual(sums.get("2026-09"), { intern: 3450, extern: 0, count: 2 });
    assert.deepEqual(sums.get("2026-10"), { intern: 1000, extern: 500, count: 1 });
  });
});
