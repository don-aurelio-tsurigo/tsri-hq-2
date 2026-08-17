import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { wepublishUploadVariables } from "./upload-image.ts";

describe("wepublishUploadVariables", () => {
  it("maps filename, alt text and credit like the Zapier upload", () => {
    const variables = wepublishUploadVariables({
      fileName: "elio-20260817-001.jpg",
      altText: "Elegante mehrgängige Pasta auf weissem Teller.",
      credit: "Elio Donauer/Tsüri.ch",
    });
    assert.equal(variables.file, null);
    assert.equal(variables.title, "elio-20260817-001.jpg");
    assert.equal(
      variables.description,
      "Elegante mehrgängige Pasta auf weissem Teller.",
    );
    assert.equal(variables.source, "Elio Donauer/Tsüri.ch");
    assert.equal(variables.focalPointX, 0.5);
    assert.equal(variables.focalPointY, 0.5);
  });

  it("falls back to the filename when alt text is missing", () => {
    const variables = wepublishUploadVariables({
      fileName: "foto.jpg",
      altText: "  ",
      credit: "Gast",
    });
    assert.equal(variables.description, "foto.jpg");
  });
});
