import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { archiveFiltersActive, parseArchiveFilters } from "./archive-filters.ts";

describe("parseArchiveFilters", () => {
  it("reads query, keyword, collection, rights, credit and dates", () => {
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
    assert.equal(filters.keyword, "zürich");
    assert.equal(filters.collectionId, "col_1");
    assert.equal(filters.rightsType, "own");
    assert.equal(filters.credit, "TSRI");
    assert.equal(filters.from, "2025-10-01");
    assert.equal(filters.to, "2025-10-31");
    assert.equal(archiveFiltersActive(filters), true);
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
