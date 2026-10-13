import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  makeRatingFilter,
  matchesRatingFilter,
  parseRatingFilterParam,
  ratingFilterLabel,
  ratingFilterToParam,
  ratingValueStars,
  ratingWhereInput,
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

  it("matches at-least filters, unrated counting as 0", () => {
    assert.equal(matchesRatingFilter(null, "gte1"), false);
    assert.equal(matchesRatingFilter(2, "gte3"), false);
    assert.equal(matchesRatingFilter(3, "gte3"), true);
    assert.equal(matchesRatingFilter(5, "gte3"), true);
  });

  it("matches at-most filters including unrated photos", () => {
    assert.equal(matchesRatingFilter(null, "lte2"), true);
    assert.equal(matchesRatingFilter(0, "lte0"), true);
    assert.equal(matchesRatingFilter(2, "lte2"), true);
    assert.equal(matchesRatingFilter(3, "lte2"), false);
  });
});

describe("rating filter params", () => {
  it("round-trips comparison params and keeps bare digits as =", () => {
    assert.equal(parseRatingFilterParam("gte3"), "gte3");
    assert.equal(parseRatingFilterParam("lte2"), "lte2");
    assert.equal(parseRatingFilterParam("eq2"), "eq2");
    assert.equal(parseRatingFilterParam("gte6"), "all");
    assert.equal(ratingFilterToParam("gte3"), "gte3");
    assert.equal(ratingFilterToParam("lte2"), "lte2");
    assert.equal(ratingFilterToParam("eq2"), "2");
  });

  it("collapses filters that match everything to all", () => {
    assert.equal(makeRatingFilter("gte", 0), "all");
    assert.equal(makeRatingFilter("lte", 5), "all");
    assert.equal(makeRatingFilter("eq", null), "all");
    assert.equal(parseRatingFilterParam("gte0"), "all");
    assert.equal(parseRatingFilterParam("lte5"), "all");
  });

  it("labels filters with their comparison symbol", () => {
    assert.equal(ratingFilterLabel("all"), "Alle");
    assert.equal(ratingFilterLabel("eq3"), "= 3");
    assert.equal(ratingFilterLabel("gte3"), "≥ 3");
    assert.equal(ratingFilterLabel("lte2"), "≤ 2");
  });
});

describe("ratingWhereInput", () => {
  it("builds Prisma clauses that treat null as 0", () => {
    assert.equal(ratingWhereInput("all"), undefined);
    assert.deepEqual(ratingWhereInput("eq3"), { rating: 3 });
    assert.deepEqual(ratingWhereInput("eq0"), { OR: [{ rating: null }, { rating: 0 }] });
    assert.deepEqual(ratingWhereInput("gte3"), { rating: { gte: 3 } });
    assert.deepEqual(ratingWhereInput("lte2"), {
      OR: [{ rating: null }, { rating: { lte: 2 } }],
    });
  });
});

describe("ratingValueStars", () => {
  it("renders filled and empty stars, 0 as text", () => {
    assert.equal(ratingValueStars(0), "Ohne Sterne");
    assert.equal(ratingValueStars(1), "★☆☆☆☆");
    assert.equal(ratingValueStars(5), "★★★★★");
  });
});
