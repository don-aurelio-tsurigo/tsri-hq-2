import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { publishedDownloadPath, publishedExportPath } from "./download-path.ts";

describe("publishedDownloadPath", () => {
  it("points original downloads at the raw master variant", () => {
    assert.equal(
      publishedDownloadPath("abc", "original"),
      "/api/dam/assets/abc/file?variant=original",
    );
  });

  it("points jpeg downloads at the export variant", () => {
    assert.equal(
      publishedDownloadPath("abc", "jpeg"),
      "/api/dam/assets/abc/file?variant=export",
    );
    assert.equal(publishedExportPath("abc"), publishedDownloadPath("abc", "jpeg"));
  });
});
