import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildArchiveFtsQuery, tokenizeArchiveQuery } from "./archive-fts-query.ts";

describe("buildArchiveFtsQuery", () => {
  it("builds AND prefix tokens and splits on punctuation", () => {
    assert.equal(buildArchiveFtsQuery("  Bingo_08.jpg  "), "bingo:* & 08:* & jpg:*");
    assert.equal(buildArchiveFtsQuery("bingo"), "bingo:*");
    assert.equal(buildArchiveFtsQuery("velo podium"), "velo:* & podium:*");
  });

  it("builds OR queries when requested", () => {
    assert.equal(buildArchiveFtsQuery("züri bar", "or"), "züri:* | bar:*");
  });

  it("returns null for empty, short, or separator-only input", () => {
    assert.equal(buildArchiveFtsQuery(""), null);
    assert.equal(buildArchiveFtsQuery("   "), null);
    assert.equal(buildArchiveFtsQuery("b"), null);
    assert.equal(buildArchiveFtsQuery("___"), null);
  });

  it("keeps unicode letters in tokens", () => {
    assert.equal(buildArchiveFtsQuery("Zürich"), "zürich:*");
  });
});

describe("tokenizeArchiveQuery", () => {
  it("splits filenames into tokens", () => {
    assert.deepEqual(tokenizeArchiveQuery("Bingo_08.jpg"), ["bingo", "08", "jpg"]);
  });
});
