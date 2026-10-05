import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AI_KEYWORD_MAX,
  applyKeywordChanges,
  fillSeriesKeywordGaps,
  sanitizeAiKeywords,
  uniqueKeywords,
  withPersonKeywords,
} from "./keywords.ts";

describe("uniqueKeywords", () => {
  it("trims, de-dupes case-insensitively, and caps at 24", () => {
    assert.deepEqual(uniqueKeywords([" Zürich ", "zürich", "Velo"]), ["Zürich", "Velo"]);
    assert.equal(uniqueKeywords(Array.from({ length: 30 }, (_, i) => `k${i}`)).length, 24);
  });
});

describe("applyKeywordChanges", () => {
  it("adds new keywords without dropping existing ones", () => {
    assert.deepEqual(
      applyKeywordChanges(["Zürich"], ["Velo", "zürich"], []),
      ["Zürich", "Velo"],
    );
  });

  it("removes keywords case-insensitively after adding", () => {
    assert.deepEqual(
      applyKeywordChanges(["Zürich", "Velo"], ["Podium"], ["zürich"]),
      ["Velo", "Podium"],
    );
  });

  it("keeps existing keywords when the list is already full", () => {
    const existing = Array.from({ length: 24 }, (_, i) => `k${i}`);
    assert.deepEqual(applyKeywordChanges(existing, ["neu"], []), existing);
  });
});

describe("sanitizeAiKeywords", () => {
  it("lowercases, truncates long phrases to three words, and caps at 12", () => {
    assert.deepEqual(
      sanitizeAiKeywords([" Zürich ", "zürich", "Velo auf der Brücke am Abend"]),
      ["zürich", "velo auf der"],
    );
    assert.equal(
      sanitizeAiKeywords(Array.from({ length: 20 }, (_, i) => `k${i}`)).length,
      AI_KEYWORD_MAX,
    );
  });

  it("keeps short two-word tags", () => {
    assert.deepEqual(sanitizeAiKeywords(["Limmatquai", "rote Fahne"]), [
      "limmatquai",
      "rote fahne",
    ]);
  });
});

describe("fillSeriesKeywordGaps", () => {
  it("fills empty slots from neighboring tagged photos in sequence", () => {
    const items = [
      { r2Key: "a", sequence: 1, keywords: ["demo", "zürich"] },
      { r2Key: "b", sequence: 2, keywords: [] },
      { r2Key: "c", sequence: 3, keywords: [] },
      { r2Key: "d", sequence: 4, keywords: ["podcast"] },
    ];
    assert.deepEqual(fillSeriesKeywordGaps(items), [
      { r2Key: "a", sequence: 1, keywords: ["demo", "zürich"] },
      { r2Key: "b", sequence: 2, keywords: ["demo", "zürich"] },
      { r2Key: "c", sequence: 3, keywords: ["demo", "zürich"] },
      { r2Key: "d", sequence: 4, keywords: ["podcast"] },
    ]);
  });
});

describe("withPersonKeywords", () => {
  it("puts person names first so the cap never drops them", () => {
    const full = Array.from({ length: 24 }, (_, i) => `k${i}`);
    const next = withPersonKeywords(full, ["Anna Muster"]);
    assert.equal(next.length, 24);
    assert.equal(next[0], "Anna Muster");
    assert.equal(next.includes("k23"), false);
  });

  it("moves an existing person keyword to the front without duplicating it", () => {
    assert.deepEqual(withPersonKeywords(["velo", "anna muster"], ["Anna Muster"]), [
      "Anna Muster",
      "velo",
    ]);
  });

  it("removes names of persons no longer linked", () => {
    assert.deepEqual(withPersonKeywords(["Anna Muster", "velo"], [], ["Anna Muster"]), ["velo"]);
  });

  it("keeps a removed name that is still linked", () => {
    assert.deepEqual(
      withPersonKeywords(["Anna Muster", "velo"], ["Anna Muster"], ["anna muster"]),
      ["Anna Muster", "velo"],
    );
  });
});
