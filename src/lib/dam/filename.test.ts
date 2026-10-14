import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildFileName, sanitizeFileTitle, sourceKey } from "./filename.ts";
import { r2KeysForAsset } from "./r2-keys.ts";

describe("buildFileName", () => {
  it("uses the collection title and a padded sequence", () => {
    assert.equal(
      buildFileName("2026-08-17 – Paul Muster", 1, "jpg"),
      "2026-08-17 – Paul Muster-001.jpg",
    );
    assert.equal(buildFileName("Demo", 12, ".png"), "Demo-012.png");
  });

  it("strips path characters from the title", () => {
    assert.equal(sanitizeFileTitle("a/b\\c"), "a-b-c");
    assert.equal(buildFileName("a/b", 2, "jpg"), "a-b-002.jpg");
  });
});

describe("sourceKey", () => {
  it("keeps the extension next to the master key", () => {
    assert.equal(
      sourceKey("staging/u/b/foto_001.tiff"),
      "staging/u/b/foto_001_source.tiff",
    );
    assert.equal(sourceKey("archive/u/a.tif"), "archive/u/a_source.tif");
  });
  it("is cleaned up together with the asset", () => {
    assert.deepEqual(r2KeysForAsset("a/x.tiff", "a/x_source.tiff"), [
      "a/x.tiff",
      "a/x_thumb.webp",
      "a/x_web.webp",
      "a/x_source.tiff",
    ]);
    assert.equal(r2KeysForAsset("a/x.jpg", null).length, 3);
  });
});
