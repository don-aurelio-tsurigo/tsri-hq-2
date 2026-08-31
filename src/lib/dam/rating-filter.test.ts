import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { matchesRatingFilter } from "./rating-filter.ts";

describe("matchesRatingFilter", () => {
  it("lets every rating through for Alle", () => {
    assert.equal(matchesRatingFilter(null, "all"), true);
    assert.equal(matchesRatingFilter(1, "all"), true);
    assert.equal(matchesRatingFilter(5, "all"), true);
  });

  it("treats missing ratings as 0 and excludes them from =N filters", () => {
    assert.equal(matchesRatingFilter(null, "eq1"), false);
    assert.equal(matchesRatingFilter(0, "eq1"), false);
    assert.equal(matchesRatingFilter(1, "eq1"), true);
    assert.equal(matchesRatingFilter(2, "eq1"), false);
  });

  it("matches exact star counts only", () => {
    assert.equal(matchesRatingFilter(2, "eq3"), false);
    assert.equal(matchesRatingFilter(3, "eq3"), true);
    assert.equal(matchesRatingFilter(5, "eq3"), false);
    assert.equal(matchesRatingFilter(4, "eq5"), false);
    assert.equal(matchesRatingFilter(5, "eq5"), true);
  });
});
