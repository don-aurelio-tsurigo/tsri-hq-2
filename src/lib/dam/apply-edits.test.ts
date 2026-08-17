import assert from "node:assert/strict";
import { describe, it } from "node:test";
import sharp from "sharp";
import { applyDamEditsToOriented, renderPublishedMaster } from "./apply-edits.ts";
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
});
