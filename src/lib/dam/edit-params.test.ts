import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cropToExtract,
  cssFilter,
  cssTransform,
  DEFAULT_EDIT_PARAMS,
  joinRotate,
  parseEditParams,
  rotatedBoundingBox,
  splitRotate,
  straightenCoverExtract,
  straightenCoverScale,
  temperatureToRgb,
} from "./edit-params.ts";

describe("parseEditParams", () => {
  it("fills defaults for legacy three-slider payloads", () => {
    const parsed = parseEditParams({
      brightness: 120,
      saturation: 90,
      contrast: 110,
      crop: null,
    });
    assert.equal(parsed.brightness, 120);
    assert.equal(parsed.rotate, 0);
    assert.equal(parsed.flipHorizontal, false);
    assert.equal(parsed.flipVertical, false);
    assert.equal(parsed.sharpen, 0);
    assert.equal(parsed.temperature, 0);
    assert.equal(parsed.aspectRatio, null);
    assert.equal(parsed.crop, null);
  });

  it("roundtrips every new field", () => {
    const parsed = parseEditParams({
      brightness: 100,
      saturation: 100,
      contrast: 100,
      rotate: 95,
      flipHorizontal: true,
      flipVertical: true,
      crop: { unit: "%", x: 10, y: 10, width: 50, height: 40 },
      aspectRatio: "16:9",
      sharpen: 40,
      temperature: -25,
    });
    assert.equal(parsed.rotate, 95);
    assert.equal(parsed.flipHorizontal, true);
    assert.equal(parsed.flipVertical, true);
    assert.equal(parsed.aspectRatio, "16:9");
    assert.equal(parsed.sharpen, 40);
    assert.equal(parsed.temperature, -25);
    assert.deepEqual(parsed.crop, {
      unit: "%",
      x: 10,
      y: 10,
      width: 50,
      height: 40,
    });
  });
});

describe("rotate split/join", () => {
  it("keeps straighten when turning 90°", () => {
    const rotate = joinRotate(0, 12);
    const turned = (rotate + 90) % 360;
    const split = splitRotate(turned);
    assert.equal(split.quarter, 90);
    assert.equal(split.straighten, 12);
  });

  it("maps 350° to quarter 0 and straighten -10", () => {
    const split = splitRotate(350);
    assert.equal(split.quarter, 0);
    assert.equal(split.straighten, -10);
    assert.equal(joinRotate(0, -10), 350);
  });
});

describe("css preview helpers", () => {
  it("approximates sharpen via extra contrast", () => {
    const filter = cssFilter({ ...DEFAULT_EDIT_PARAMS, sharpen: 80 });
    assert.match(filter, /contrast\(1\.2\)/);
  });

  it("approximates warm temperature with sepia", () => {
    const filter = cssFilter({ ...DEFAULT_EDIT_PARAMS, temperature: 40 });
    assert.match(filter, /sepia\(/);
    assert.match(filter, /hue-rotate\(/);
  });

  it("applies rotate after flips so CSS matches sharp order", () => {
    const transform = cssTransform({
      ...DEFAULT_EDIT_PARAMS,
      rotate: 90,
      flipHorizontal: true,
    });
    assert.equal(transform, "scaleX(-1) rotate(90deg)");
  });

  it("zooms when straightening so the frame stays filled", () => {
    const transform = cssTransform(
      { ...DEFAULT_EDIT_PARAMS, rotate: 10 },
      { width: 200, height: 100 },
    );
    assert.match(transform ?? "", /scale\(/);
    assert.match(transform ?? "", /rotate\(10deg\)/);
  });
});

describe("geometry helpers", () => {
  it("swaps bounding box on 90°", () => {
    const box = rotatedBoundingBox(200, 100, 90);
    assert.ok(Math.abs(box.width - 100) < 1e-6);
    assert.ok(Math.abs(box.height - 200) < 1e-6);
  });

  it("converts percent crop to extract region", () => {
    assert.deepEqual(
      cropToExtract(
        { unit: "%", x: 10, y: 20, width: 50, height: 40 },
        1000,
        500,
      ),
      { left: 100, top: 100, width: 500, height: 200 },
    );
  });

  it("does not cover-crop exact 90° turns", () => {
    assert.equal(straightenCoverScale(200, 100, 90), 1);
    assert.equal(straightenCoverExtract(200, 100, 90), null);
  });

  it("cover-crops straighten so the extract stays inside the rotated frame", () => {
    assert.ok(straightenCoverScale(200, 100, 10) > 1);
    const region = straightenCoverExtract(200, 100, 10);
    assert.ok(region);
    const bbox = rotatedBoundingBox(200, 100, 10);
    assert.ok(region.left >= 0);
    assert.ok(region.top >= 0);
    assert.ok(region.left + region.width <= bbox.width + 1);
    assert.ok(region.top + region.height <= bbox.height + 1);
    assert.ok(region.width < bbox.width);
    assert.ok(region.height < bbox.height);
  });
});

describe("temperatureToRgb", () => {
  it("is white at 0 so tint can be skipped", () => {
    assert.deepEqual(temperatureToRgb(0), { r: 255, g: 255, b: 255 });
  });

  it("warms toward yellow/red and cools toward blue", () => {
    const warm = temperatureToRgb(100);
    const cool = temperatureToRgb(-100);
    assert.ok(warm.b < warm.r);
    assert.ok(cool.r < cool.b);
  });
});

describe("before/after preview", () => {
  it("does not mutate stored params when showing defaults", () => {
    const stored = parseEditParams({ rotate: 90, sharpen: 50, temperature: 20 });
    const snapshot = { ...stored };
    const preview = DEFAULT_EDIT_PARAMS;
    assert.equal(preview.rotate, 0);
    assert.deepEqual(stored, snapshot);
    assert.equal(stored.rotate, 90);
    assert.equal(stored.sharpen, 50);
  });
});
