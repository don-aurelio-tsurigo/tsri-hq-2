import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canonicalizeWikiHref,
  getInternalAppHref,
  isExternalWikiHref,
  normalizeWikiHref,
} from "@/lib/wiki-links";

describe("wiki-links", () => {
  it("keeps relative and app paths internal", () => {
    assert.equal(getInternalAppHref("/spaces/abc?page=onboarding"), "/spaces/abc?page=onboarding");
    assert.equal(getInternalAppHref("?page=onboarding"), "?page=onboarding");
    assert.equal(getInternalAppHref("#abschnitt"), null);
  });

  it("rewrites absolute wiki URLs to app paths", () => {
    assert.equal(
      getInternalAppHref("https://example.com/spaces/abc?page=wer-ist-wer"),
      "/spaces/abc?page=wer-ist-wer",
    );
    assert.equal(
      canonicalizeWikiHref("https://example.com/spaces/abc?page=wer-ist-wer"),
      "/spaces/abc?page=wer-ist-wer",
    );
  });

  it("treats third-party URLs as external", () => {
    assert.equal(getInternalAppHref("https://youtube.com/watch?v=1"), null);
    assert.equal(isExternalWikiHref("https://youtube.com/watch?v=1"), true);
    assert.equal(isExternalWikiHref("/spaces/abc?page=x"), false);
  });

  it("normalizes bare domains to https", () => {
    assert.equal(normalizeWikiHref("example.com/path"), "https://example.com/path");
  });
});
