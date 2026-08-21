import assert from "node:assert/strict";
import { describe, it } from "node:test";
import sharp from "sharp";
import { createMasterImage, MASTER_MAX_EDGE } from "./master.ts";
import { buildArchiveKey, buildMediagraphArchiveKey, contentDispositionAttachment, fileExtension, replaceKeyExtension, uniqueDownloadName } from "./filename.ts";

async function makeImage(
  width: number,
  height: number,
  format: "jpeg" | "png" | "webp",
) {
  const img = sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 40, g: 80, b: 120 },
    },
  });
  if (format === "png") return img.png().toBuffer();
  if (format === "webp") return img.webp({ quality: 90 }).toBuffer();
  return img.jpeg({ quality: 95 }).toBuffer();
}

describe("createMasterImage", () => {
  it("does not upscale images already inside 4000px", async () => {
    const original = await makeImage(800, 500, "jpeg");
    const master = await createMasterImage(original);
    assert.equal(master.width, 800);
    assert.equal(master.height, 500);
    assert.equal(master.contentType, "image/jpeg");
    assert.equal(master.extension, "jpg");
  });

  it("caps the long edge at 4000px and keeps aspect ratio", async () => {
    const original = await makeImage(6000, 3000, "jpeg");
    const master = await createMasterImage(original);
    assert.equal(master.width, MASTER_MAX_EDGE);
    assert.equal(master.height, 2000);
    assert.equal(master.contentType, "image/jpeg");
  });

  it("keeps PNG and WebP encodings", async () => {
    const png = await createMasterImage(await makeImage(120, 80, "png"));
    assert.equal(png.contentType, "image/png");
    assert.equal(png.buffer[0], 0x89);

    const webp = await createMasterImage(await makeImage(120, 80, "webp"));
    assert.equal(webp.contentType, "image/webp");
    assert.equal(String.fromCharCode(...webp.buffer.subarray(8, 12)), "WEBP");
  });

  it("rejects bytes that sharp cannot decode", async () => {
    await assert.rejects(() => createMasterImage(Buffer.from("not-an-image")));
  });
});

describe("fileExtension", () => {
  it("reads the suffix from keys and file names", () => {
    assert.equal(fileExtension("staging/u/b/001-abc.png"), "png");
    assert.equal(fileExtension("foto.JPEG"), "jpg");
    assert.equal(fileExtension("no-ext"), "jpg");
  });
});

describe("replaceKeyExtension", () => {
  it("rewrites HEIC keys to jpeg masters", () => {
    assert.equal(
      replaceKeyExtension("staging/u/b/001-abc.heic", "jpg"),
      "staging/u/b/001-abc.jpg",
    );
    assert.equal(replaceKeyExtension("foto-20260817-001.HEIC", "jpg"), "foto-20260817-001.jpg");
  });
});

describe("contentDispositionAttachment", () => {
  it("sets an ASCII filename and a UTF-8 fallback", () => {
    const header = contentDispositionAttachment("zürich.jpg");
    assert.equal(header.includes("\n"), false);
    assert.match(header, /^attachment; filename="z_rich\.jpg"/);
    assert.match(header, /filename\*=UTF-8''z%C3%BCrich\.jpg$/);
  });
});

describe("uniqueDownloadName", () => {
  it("keeps the first name and suffixes collisions", () => {
    const used = new Set<string>();
    assert.equal(uniqueDownloadName(used, "foto.jpg"), "foto.jpg");
    assert.equal(uniqueDownloadName(used, "foto.jpg"), "foto-2.jpg");
    assert.equal(uniqueDownloadName(used, "foto.jpg"), "foto-3.jpg");
  });
});

describe("buildArchiveKey", () => {
  it("writes published files under archive/ and leaves staging paths unused", () => {
    const key = buildArchiveKey({ userId: "user1", assetId: "asset1", ext: "jpg" });
    assert.match(key, /^archive\/user1\/asset1\/.+\.jpg$/);
    assert.equal(key.startsWith("staging/"), false);
  });
});

describe("buildMediagraphArchiveKey", () => {
  it("keeps imported masters under a dedicated archive prefix", () => {
    const key = buildMediagraphArchiveKey("guid-123", "jpg");
    assert.match(key, /^archive\/mediagraph-import\/guid-123-.+\.jpg$/);
  });
});
