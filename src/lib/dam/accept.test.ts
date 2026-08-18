import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizedContentType, rejectReason, sniffImageContentType } from "./accept.ts";

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

describe("sniffImageContentType", () => {
  it("detects jpeg, png and heic from magic bytes", () => {
    assert.equal(sniffImageContentType(Buffer.from([0xff, 0xd8, 0xff, 0xdb])), "image/jpeg");
    assert.equal(
      sniffImageContentType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])),
      "image/png",
    );
    const heic = Buffer.alloc(12);
    heic[4] = 0x66;
    heic[5] = 0x74;
    heic[6] = 0x79;
    heic[7] = 0x70;
    heic.set(Buffer.from("heic"), 8);
    assert.equal(sniffImageContentType(heic), "image/heic");
  });

  it("does not trust a jpeg label on heic bytes", () => {
    const heic = Buffer.alloc(12);
    heic[4] = 0x66;
    heic[5] = 0x74;
    heic[6] = 0x79;
    heic[7] = 0x70;
    heic.set(Buffer.from("mif1"), 8);
    assert.equal(sniffImageContentType(heic), "image/heic");
  });
});
