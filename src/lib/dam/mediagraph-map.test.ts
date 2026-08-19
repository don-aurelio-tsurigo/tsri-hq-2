import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  collectionNamesFromAsset,
  creditFromAsset,
  flattenCollectionName,
  isImageAsset,
  keywordsFromTags,
  mapRightsType,
  shouldUseFullRendition,
  takenAtFromAsset,
  UNSORTED_COLLECTION_NAME,
  type MediagraphAsset,
} from "./mediagraph-map.ts";

function asset(partial: Partial<MediagraphAsset>): MediagraphAsset {
  return { id: 1, guid: "g-1", ...partial };
}

describe("creditFromAsset", () => {
  it("prefers credit_line, then creator_tag, then creator array", () => {
    assert.equal(
      creditFromAsset(asset({ credit_line: "Line", creator_tag: { name: "Tag" }, creator: ["Arr"] })),
      "Line",
    );
    assert.equal(
      creditFromAsset(asset({ credit_line: " ", creator_tag: { name: "Tag" }, creator: ["Arr"] })),
      "Tag",
    );
    assert.equal(creditFromAsset(asset({ creator: ["Arr"] }), "Fetched"), "Fetched");
    assert.equal(creditFromAsset(asset({ creator: ["Arr"] })), "Arr");
    assert.equal(creditFromAsset(asset({})), "Unbekannt");
  });
});

describe("mapRightsType", () => {
  const ids = {
    own: new Set(["10"]),
    provided: new Set(["20"]),
    free_use: new Set(["30"]),
  };

  it("matches package ids first", () => {
    assert.equal(mapRightsType(asset({ rights_package_id: 10 }), ids), "own");
    assert.equal(mapRightsType(asset({ rights_package_id: "20" }), ids), "provided");
    assert.equal(mapRightsType(asset({ rights_package: { id: 30 } }), ids), "free_use");
  });

  it("falls back to known package names", () => {
    assert.equal(mapRightsType(asset({ rights_package: { name: "Tsüri.ch" } }), ids), "own");
    assert.equal(mapRightsType(asset({ rights_package: { name: "ZVG (Tsüri only)" } }), ids), "provided");
    assert.equal(mapRightsType(asset({ rights_status: "Royalty free" }), ids), "free_use");
  });

  it("maps Mediagraph rights_status owned/some/unlimited", () => {
    assert.equal(mapRightsType(asset({ rights_package_id: 15594, rights_status: "owned" })), "own");
    assert.equal(mapRightsType(asset({ rights_package_id: 16571, rights_status: "some" })), "provided");
    assert.equal(mapRightsType(asset({ rights_status: "unlimited" }), ids), "free_use");
  });

  it("returns null when unknown", () => {
    assert.equal(mapRightsType(asset({ rights_package: { name: "Mystery" } }), ids), null);
  });
});

describe("keywordsFromTags", () => {
  it("takes tag names including person subtypes and skips blanks", () => {
    assert.deepEqual(
      keywordsFromTags([
        { name: "Zürich", sub_type: "keyword" },
        { name: "Anna", sub_type: "person" },
        { name: "zürich", sub_type: "keyword" },
        { name: "  ", sub_type: "system" },
      ]),
      ["Zürich", "Anna"],
    );
  });
});

describe("collectionNamesFromAsset", () => {
  it("uses a fallback when the asset has no collections", () => {
    assert.deepEqual(collectionNamesFromAsset(asset({})), [UNSORTED_COLLECTION_NAME]);
  });

  it("flattens nested path names", () => {
    assert.equal(
      flattenCollectionName({
        name: "Leaf",
        path_names: ["Events", "2024", "Demo"],
      }),
      "Events / 2024 / Demo",
    );
  });
});

describe("isImageAsset / RAW fallback", () => {
  it("only treats type Image as importable", () => {
    assert.equal(isImageAsset(asset({ type: "Image" })), true);
    assert.equal(isImageAsset(asset({ type: "Video" })), false);
  });

  it("uses the JPEG rendition for RAW originals", () => {
    assert.equal(shouldUseFullRendition(asset({ filename: "x.CR3", ext: "cr3" })), true);
    assert.equal(shouldUseFullRendition(asset({ filename: "x.jpg", ext: "jpg" })), false);
  });
});

describe("takenAtFromAsset", () => {
  it("prefers EXIF then captured_at", () => {
    const exif = new Date("2020-01-01T00:00:00.000Z");
    assert.equal(
      takenAtFromAsset(asset({ captured_at: "2021-01-01T00:00:00.000Z" }), exif)?.toISOString(),
      "2020-01-01T00:00:00.000Z",
    );
    assert.equal(
      takenAtFromAsset(asset({ captured_at: "2021-06-02T10:00:00.000Z" }), null)?.toISOString(),
      "2021-06-02T10:00:00.000Z",
    );
  });
});
