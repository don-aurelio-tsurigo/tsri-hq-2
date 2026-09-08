import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildArchiveFtsQuery } from "./archive-fts-query.ts";

describe("buildArchiveFtsQuery", () => {
  it("builds prefix tokens and splits on punctuation", () => {
    assert.equal(buildArchiveFtsQuery("  Bingo_08.jpg  "), "bingo:* & 08:* & jpg:*");
    assert.equal(buildArchiveFtsQuery("bingo"), "bingo:*");
    assert.equal(buildArchiveFtsQuery("velo podium"), "velo:* & podium:*");
  });

  it("returns null for empty / separator-only input", () => {
    assert.equal(buildArchiveFtsQuery(""), null);
    assert.equal(buildArchiveFtsQuery("   "), null);
    assert.equal(buildArchiveFtsQuery("___"), null);
  });

  it("keeps unicode letters in tokens", () => {
    assert.equal(buildArchiveFtsQuery("Zürich"), "zürich:*");
  });
});
