import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { matchesRatingFilter } from "./rating-filter.ts";

describe("matchesRatingFilter", () => {
  it("lets every rating through for Alle", () => {
    assert.equal(matchesRatingFilter(null, "all"), true);
    assert.equal(matchesRatingFilter(1, "all"), true);
    assert.equal(matchesRatingFilter(5, "all"), true);
  });

  it("treats missing ratings as below the thresholds", () => {
    assert.equal(matchesRatingFilter(null, "gte2"), false);
    assert.equal(matchesRatingFilter(1, "gte2"), false);
    assert.equal(matchesRatingFilter(2, "gte2"), true);
  });

  it("matches ≥ 3 and = 5 as labelled", () => {
    assert.equal(matchesRatingFilter(2, "gte3"), false);
    assert.equal(matchesRatingFilter(3, "gte3"), true);
    assert.equal(matchesRatingFilter(5, "gte3"), true);
    assert.equal(matchesRatingFilter(4, "eq5"), false);
    assert.equal(matchesRatingFilter(5, "eq5"), true);
  });
});
