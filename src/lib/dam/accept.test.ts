import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizedContentType, rejectReason } from "./accept.ts";

describe("rejectReason", () => {
  it("accepts jpeg without an extension (iOS camera / PWA)", () => {
    assert.equal(rejectReason("image", "image/jpeg", 1200), null);
    assert.equal(rejectReason("image", "image/jpg", 1200), null);
  });

  it("accepts heic with empty mime", () => {
    assert.equal(rejectReason("IMG_1234.HEIC", "", 1200), null);
  });

  it("accepts jpeg labeled as octet-stream", () => {
    assert.equal(rejectReason("foto.jpg", "application/octet-stream", 1200), null);
  });

  it("rejects gif and unnamed blobs", () => {
    assert.match(rejectReason("clip.gif", "image/gif", 1200) ?? "", /Format/);
    assert.match(rejectReason("image", "", 1200) ?? "", /Format/);
  });
});

describe("normalizedContentType", () => {
  it("maps mobile jpeg aliases to image/jpeg", () => {
    assert.equal(normalizedContentType("image", "image/jpg"), "image/jpeg");
    assert.equal(normalizedContentType("foto.jpg", ""), "image/jpeg");
  });
});
