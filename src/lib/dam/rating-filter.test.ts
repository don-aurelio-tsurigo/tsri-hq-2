import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  matchesRatingFilter,
  parseRatingFilterParam,
  ratingFilterToParam,
} from "./rating-filter.ts";

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

  it("matches unrated photos for = 0", () => {
    assert.equal(matchesRatingFilter(null, "eq0"), true);
    assert.equal(matchesRatingFilter(0, "eq0"), true);
    assert.equal(matchesRatingFilter(1, "eq0"), false);
    assert.equal(matchesRatingFilter(5, "eq0"), false);
  });

  it("round-trips rating URL params", () => {
    assert.equal(parseRatingFilterParam("0"), "eq0");
    assert.equal(parseRatingFilterParam("3"), "eq3");
    assert.equal(parseRatingFilterParam(""), "all");
    assert.equal(parseRatingFilterParam("x"), "all");
    assert.equal(ratingFilterToParam("all"), "");
    assert.equal(ratingFilterToParam("eq0"), "0");
    assert.equal(ratingFilterToParam("eq4"), "4");
  });

  it("matches exact star counts only", () => {
    assert.equal(matchesRatingFilter(2, "eq3"), false);
    assert.equal(matchesRatingFilter(3, "eq3"), true);
    assert.equal(matchesRatingFilter(5, "eq3"), false);
    assert.equal(matchesRatingFilter(4, "eq5"), false);
    assert.equal(matchesRatingFilter(5, "eq5"), true);
  });
});
