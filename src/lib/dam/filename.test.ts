import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildFileName, sanitizeFileTitle } from "./filename.ts";

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
