import assert from "node:assert/strict";
import { describe, it } from "node:test";
import sharp from "sharp";
import {
  applyDamEditsToOriented,
  renderDamPreviewWebp,
  renderMailchimpSquare,
  renderPublishedMaster,
} from "./apply-edits.ts";
import { DEFAULT_EDIT_PARAMS } from "./edit-params.ts";

async function solidPng(
  width: number,
  height: number,
  background: { r: number; g: number; b: number },
) {
  return sharp({
    create: { width, height, channels: 3, background },
  })
    .png()
    .toBuffer();
}

describe("applyDamEditsToOriented", () => {
  it("applies crop after rotate so percentages use rotated dimensions", async () => {
    const input = await solidPng(100, 40, { r: 20, g: 20, b: 20 });
    const cropped = await applyDamEditsToOriented(input, {
      ...DEFAULT_EDIT_PARAMS,
      rotate: 90,
      crop: { unit: "%", x: 0, y: 0, width: 100, height: 50 },
    });
    const meta = await sharp(cropped).metadata();
    // rotate 90 → 40×100, then 50% height → 40×50
    // (crop-before-rotate would yield 20×100)
    assert.equal(meta.width, 40);
    assert.equal(meta.height, 50);
  });

  it("leaves dimensions unchanged when params are defaults", async () => {
    const input = await solidPng(32, 24, { r: 12, g: 34, b: 56 });
    const output = await applyDamEditsToOriented(input, DEFAULT_EDIT_PARAMS);
    const meta = await sharp(output).metadata();
    assert.equal(meta.width, 32);
    assert.equal(meta.height, 24);
  });

  it("fills the frame when straightening so corners are not black", async () => {
    const input = await solidPng(200, 100, { r: 220, g: 40, b: 40 });
    const output = await applyDamEditsToOriented(input, {
      ...DEFAULT_EDIT_PARAMS,
      rotate: 10,
    });
    const { data, info } = await sharp(output)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    assert.equal(info.channels, 3);
    const sample = [
      [0, 0],
      [info.width - 1, 0],
      [0, info.height - 1],
      [info.width - 1, info.height - 1],
    ];
    for (const [x, y] of sample) {
      const i = (y * info.width + x) * 3;
      assert.ok(
        data[i] > 80,
        `corner ${x},${y} should not be the black rotate background`,
      );
    }
    assert.ok(Math.abs(info.width / info.height - 2) < 0.08);
  });
});

describe("renderDamPreviewWebp", () => {
  it("returns an axis-aligned webp after straighten", async () => {
    const input = await solidPng(200, 100, { r: 220, g: 40, b: 40 });
    const preview = await renderDamPreviewWebp(
      input,
      { ...DEFAULT_EDIT_PARAMS, rotate: 10 },
      480,
      80,
    );
    const meta = await sharp(preview).metadata();
    assert.equal(meta.format, "webp");
    assert.ok(meta.width && meta.height);
    assert.ok(Math.abs(meta.width / meta.height - 2) < 0.08);
  });

  it("preserves color when baking temperature adjustments", async () => {
    const input = await solidPng(120, 80, { r: 180, g: 120, b: 60 });
    const output = await applyDamEditsToOriented(input, {
      ...DEFAULT_EDIT_PARAMS,
      brightness: 105,
      contrast: 125,
      saturation: 108,
      temperature: -8,
      sharpen: 17,
    });
    const { data, info } = await sharp(output)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let satSum = 0;
    let samples = 0;
    for (let i = 0; i < info.width * info.height; i += 1) {
      const r = data[i * 3];
      const g = data[i * 3 + 1];
      const b = data[i * 3 + 2];
      const max = Math.max(r, g, b) / 255;
      const min = Math.min(r, g, b) / 255;
      if (max > 0) {
        satSum += (max - min) / max;
        samples += 1;
      }
    }
    const avgSat = satSum / samples;
    assert.ok(avgSat > 0.35, "temperature bake should not desaturate to greyscale");
  });
});

describe("renderPublishedMaster", () => {
  it("bakes brightness into a jpeg archive master", async () => {
    const input = await solidPng(24, 16, { r: 80, g: 80, b: 80 });
    const published = await renderPublishedMaster(input, {
      ...DEFAULT_EDIT_PARAMS,
      brightness: 180,
    });
    assert.equal(published.buffer[0], 0xff);
    assert.equal(published.buffer[1], 0xd8);
    const { data } = await sharp(published.buffer)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let sum = 0;
    for (let i = 0; i < data.length; i += 3) sum += data[i];
    const mean = sum / (data.length / 3);
    assert.ok(mean > 100, "brightened pixels should be lighter than the source 80");
  });

  it("converts CMYK TIFF to sRGB JPEG for WePublish / export", async () => {
    const cmykTiff = await sharp({
      create: {
        width: 24,
        height: 16,
        channels: 3,
        background: { r: 200, g: 40, b: 40 },
      },
    })
      .toColorspace("cmyk")
      .tiff()
      .toBuffer();
    assert.equal((await sharp(cmykTiff).metadata()).space, "cmyk");

    const published = await renderPublishedMaster(cmykTiff, DEFAULT_EDIT_PARAMS);
    assert.equal(published.buffer[0], 0xff);
    assert.equal(published.buffer[1], 0xd8);
    assert.equal(published.contentType, "image/jpeg");
    const after = await sharp(published.buffer).metadata();
    assert.notEqual(after.space, "cmyk");
  });

  it("preserves TIFF when preserveFormat is set and still applies crop", async () => {
    const tiff = await sharp({
      create: {
        width: 100,
        height: 40,
        channels: 3,
        background: { r: 20, g: 20, b: 20 },
      },
    })
      .tiff()
      .toBuffer();

    const published = await renderPublishedMaster(
      tiff,
      {
        ...DEFAULT_EDIT_PARAMS,
        crop: { unit: "%", x: 0, y: 0, width: 50, height: 100 },
      },
      null,
      { preserveFormat: true },
    );
    assert.equal(published.contentType, "image/tiff");
    assert.equal(published.extension, "tiff");
    assert.equal((await sharp(published.buffer).metadata()).format, "tiff");
    assert.equal(published.width, 50);
    assert.equal(published.height, 40);
  });
});

describe("renderMailchimpSquare", () => {
  it("exports a 800×800 JPEG from a temporary square crop", async () => {
    const input = await solidPng(1200, 800, { r: 40, g: 80, b: 120 });
    const result = await renderMailchimpSquare(
      input,
      DEFAULT_EDIT_PARAMS,
      { unit: "%", x: 10, y: 0, width: 66.67, height: 100 },
    );
    assert.equal(result.contentType, "image/jpeg");
    assert.equal(result.extension, "jpg");
    assert.equal(result.width, 800);
    assert.equal(result.height, 800);
    assert.equal((await sharp(result.buffer).metadata()).format, "jpeg");
  });
});
