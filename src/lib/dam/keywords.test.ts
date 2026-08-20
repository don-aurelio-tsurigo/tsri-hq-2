import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyKeywordChanges, uniqueKeywords } from "./keywords.ts";

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
