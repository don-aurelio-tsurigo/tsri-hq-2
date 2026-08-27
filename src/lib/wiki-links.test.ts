import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canonicalizeWikiHref,
  getInternalAppHref,
  isExternalWikiHref,
  normalizeWikiHref,
} from "@/lib/wiki-links";

const APP = "https://hq.example";

describe("wiki-links", () => {
  it("keeps relative and app paths internal", () => {
    assert.equal(
      getInternalAppHref("/spaces/abc?page=onboarding"),
      "/spaces/abc?page=onboarding",
    );
    assert.equal(getInternalAppHref("?page=onboarding"), "?page=onboarding");
    assert.equal(getInternalAppHref("#abschnitt"), null);
  });

  it("rewrites only same-origin absolute URLs to app paths", () => {
    assert.equal(
      getInternalAppHref(`${APP}/spaces/abc?page=wer-ist-wer`, APP),
      "/spaces/abc?page=wer-ist-wer",
    );
    assert.equal(
      canonicalizeWikiHref(`${APP}/spaces/abc?page=wer-ist-wer`, APP),
      "/spaces/abc?page=wer-ist-wer",
    );
  });

  it("does not rewrite third-party URLs even with / or /home paths", () => {
    assert.equal(getInternalAppHref("https://google.com/", APP), null);
    assert.equal(getInternalAppHref("https://google.com/home", APP), null);
    assert.equal(
      getInternalAppHref("https://example.com/spaces/abc?page=x", APP),
      null,
    );
    assert.equal(isExternalWikiHref("https://google.com/", APP), true);
    assert.equal(isExternalWikiHref("https://youtube.com/watch?v=1", APP), true);
    assert.equal(isExternalWikiHref("/spaces/abc?page=x", APP), false);
  });

  it("normalizes bare domains to https", () => {
    assert.equal(
      normalizeWikiHref("example.com/path"),
      "https://example.com/path",
    );
  });
});
