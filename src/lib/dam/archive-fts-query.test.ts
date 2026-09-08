import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  archiveSearchPhrase,
  buildArchiveFtsQuery,
  tokenizeArchiveQuery,
} from "./archive-fts-query.ts";

describe("buildArchiveFtsQuery", () => {
  it("uses prefix only for tokens with 4+ characters", () => {
    assert.equal(buildArchiveFtsQuery("bingo"), "bingo:*");
    assert.equal(buildArchiveFtsQuery("  Bingo_08.jpg  "), "bingo:* & 08 & jpg");
    assert.equal(buildArchiveFtsQuery("velo podium"), "velo:* & podium:*");
  });

  it("keeps short tokens exact so bar ≠ barrierefreiheit", () => {
    assert.equal(buildArchiveFtsQuery("züri bar"), "züri:* & bar");
    assert.equal(buildArchiveFtsQuery("züri bar", "or"), "züri:* | bar");
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

describe("archiveSearchPhrase", () => {
  it("joins normalized tokens", () => {
    assert.equal(archiveSearchPhrase("  Züri Bar! "), "züri bar");
  });
});

describe("tokenizeArchiveQuery", () => {
  it("splits filenames into tokens", () => {
    assert.deepEqual(tokenizeArchiveQuery("Bingo_08.jpg"), ["bingo", "08", "jpg"]);
  });
});
