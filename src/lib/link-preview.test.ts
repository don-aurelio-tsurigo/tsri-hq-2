import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatPreviewTitle,
  titleForPath,
  titleForSpaceSlug,
} from "./link-preview.ts";

describe("titleForPath", () => {
  it("maps sidebar routes", () => {
    assert.equal(titleForPath("/feedback"), "Feedback");
    assert.equal(titleForPath("/dam/upload"), "Upload");
    assert.equal(titleForPath("/dam/archive?q=x"), "Alle Fotos");
    assert.equal(titleForPath("/carousel/abc"), "Social Media");
    assert.equal(titleForPath("/projects/xyz"), "Projekte");
  });

  it("prefers longer dam prefixes", () => {
    assert.equal(titleForPath("/dam"), "Alle Fotos");
    assert.equal(titleForPath("/dam/personal"), "Meine Uploads");
  });
});

describe("formatPreviewTitle", () => {
  it("joins section with site name", () => {
    assert.equal(formatPreviewTitle("Feedback"), "Feedback · Tsüri Hub");
    assert.equal(formatPreviewTitle(null), "Tsüri Hub");
  });
});

describe("titleForSpaceSlug", () => {
  it("maps known slugs", () => {
    assert.equal(titleForSpaceSlug("redaktion"), "Artikel");
    assert.equal(titleForSpaceSlug("quellen"), "Newsfeed");
  });
});
