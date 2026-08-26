import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertWikiR2Key,
  buildWikiImageR2Key,
  extractWikiImageIds,
  isAllowedWikiImageType,
  parseWikiImageIdFromHref,
  wikiImagePublicPath,
  WIKI_R2_PREFIX,
} from "@/lib/wiki-images";

describe("wiki-images", () => {
  it("builds keys only under wiki/{orgId}/", () => {
    const key = buildWikiImageR2Key({
      organizationId: "org1",
      imageId: "img1",
      contentType: "image/jpeg",
    });
    assert.ok(key.startsWith(`${WIKI_R2_PREFIX}org1/img1/`));
    assert.ok(!key.startsWith("staging/"));
    assert.ok(!key.startsWith("archive/"));
    assertWikiR2Key(key, "org1");
  });

  it("rejects dam prefixes", () => {
    assert.throws(() => assertWikiR2Key("staging/u/x.jpg", "org1"));
    assert.throws(() => assertWikiR2Key("archive/u/x.jpg", "org1"));
    assert.throws(() => assertWikiR2Key("wiki/other/img/x.jpg", "org1"));
  });

  it("parses public paths", () => {
    assert.equal(wikiImagePublicPath("abc"), "/api/wiki/images/abc");
    assert.equal(parseWikiImageIdFromHref("/api/wiki/images/abc"), "abc");
    assert.equal(
      parseWikiImageIdFromHref("https://app.example/api/wiki/images/abc"),
      "abc",
    );
  });

  it("extracts image ids from markdown", () => {
    const ids = extractWikiImageIds(
      'Hallo ![x](/api/wiki/images/aaa)\nund <img src="/api/wiki/images/bbb">',
    );
    assert.deepEqual([...ids].sort(), ["aaa", "bbb"]);
  });

  it("allows common image types", () => {
    assert.equal(isAllowedWikiImageType("image/png"), true);
    assert.equal(isAllowedWikiImageType("image/heic"), false);
  });
});
