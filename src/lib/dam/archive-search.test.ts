import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  archiveCollectionHref,
  archiveFilterChipCount,
  archiveFiltersActive,
  archiveFiltersToSearchParams,
  hiddenArchiveFilterCount,
  parseArchiveFilters,
  parseArchiveFiltersFromSearchParams,
} from "./archive-filters.ts";

describe("parseArchiveFilters", () => {
  it("reads query, keywords, collection, rights, credit and dates", () => {
    const filters = parseArchiveFilters({
      q: "  velo podium  ",
      keyword: "zürich",
      collection: "col_1",
      rights: "own",
      credit: "TSRI",
      from: "2025-10-01",
      to: "2025-10-31",
    });
    assert.equal(filters.q, "velo podium");
    assert.deepEqual(filters.keywords, ["zürich"]);
    assert.equal(filters.collectionId, "col_1");
    assert.equal(filters.rightsType, "own");
    assert.equal(filters.credit, "TSRI");
    assert.equal(filters.from, "2025-10-01");
    assert.equal(filters.to, "2025-10-31");
    assert.equal(archiveFiltersActive(filters), true);
  });

  it("keeps multiple keywords in order and drops duplicates", () => {
    const filters = parseArchiveFilters({
      keyword: ["zürich", "velo", "zürich", "  "],
    });
    assert.deepEqual(filters.keywords, ["zürich", "velo"]);
  });

  it("drops invalid rights and dates", () => {
    const filters = parseArchiveFilters({
      rights: "secret",
      from: "10.10.2025",
      to: "nope",
    });
    assert.equal(filters.rightsType, "");
    assert.equal(filters.from, "");
    assert.equal(filters.to, "");
    assert.equal(archiveFiltersActive(filters), false);
  });
});

describe("archive filter chips", () => {
  it("counts extra-panel filters separately from search and collection", () => {
    const filters = parseArchiveFilters({
      q: "demo",
      collection: "col_1",
      keyword: ["zürich", "velo"],
      rights: "own",
    });
    assert.equal(archiveFilterChipCount(filters), 5);
    assert.equal(hiddenArchiveFilterCount(filters), 3);
  });
});

describe("archiveFiltersToSearchParams", () => {
  it("roundtrips repeated keywords", () => {
    const filters = parseArchiveFilters({
      q: "podium",
      keyword: ["zürich", "velo"],
      collection: "col_1",
    });
    const params = archiveFiltersToSearchParams(filters);
    assert.equal(params.get("q"), "podium");
    assert.deepEqual(params.getAll("keyword"), ["zürich", "velo"]);
    assert.equal(params.get("collection"), "col_1");
    assert.deepEqual(parseArchiveFiltersFromSearchParams(params), filters);
  });
});

describe("archiveCollectionHref", () => {
  it("points at the archive filtered to one collection", () => {
    assert.equal(archiveCollectionHref("col_1"), "/dam/archive?collection=col_1");
  });
});
