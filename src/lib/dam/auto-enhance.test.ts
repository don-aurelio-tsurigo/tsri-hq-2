import assert from "node:assert/strict";
import { describe, it } from "node:test";
import sharp from "sharp";
import {
  analyzeAutoEnhance,
  analyzePixels,
  applyNoOpProtection,
  buildOutdoorSceneAnalysis,
  loadRawPixels,
  minMaxSpan,
  percentileFromHistogram,
  percentileSpan,
  suggestAutoEnhance,
  suggestSaturation,
  suggestTemperature,
} from "./auto-enhance.ts";

function buildRaw(
  width: number,
  height: number,
  paint: (x: number, y: number, i: number, raw: Buffer) => void,
) {
  const raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      paint(x, y, (y * width + x) * 3, raw);
    }
  }
  return raw;
}

async function encodePng(raw: Buffer, width: number, height: number) {
  return sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

describe("percentileFromHistogram", () => {
  it("finds percentile positions in a histogram", () => {
    const hist = new Uint32Array(256);
    for (let i = 100; i <= 140; i += 1) hist[i] = 10;
    assert.equal(percentileFromHistogram(hist, 0.01), 100);
    assert.equal(percentileFromHistogram(hist, 0.99), 140);
  });
});

describe("suggestAutoEnhance", () => {
  it("boosts contrast on low-spread images", () => {
    const raw = buildRaw(64, 64, (_x, _y, i, buf) => {
      const v = 110;
      buf[i] = v;
      buf[i + 1] = v;
      buf[i + 2] = v;
    });
    const analysis = analyzePixels(raw, 64, 64, 3);
    const suggestion = suggestAutoEnhance(analysis);
    assert.ok(suggestion.contrast > 100);
  });

  it("ignores outlier pixels via percentile clipping", () => {
    const raw = buildRaw(100, 100, (x, _y, i, buf) => {
      const v = 120 + Math.round((x / 99) * 20);
      buf[i] = v;
      buf[i + 1] = v;
      buf[i + 2] = v;
    });
    raw[0] = 0;
    raw[1] = 0;
    raw[2] = 0;
    raw[3] = 255;
    raw[4] = 255;
    raw[5] = 255;
    const analysis = analyzePixels(raw, 100, 100, 3);
    assert.ok(minMaxSpan(analysis) > 200);
    assert.ok(percentileSpan(analysis) < 40);
    const suggestion = suggestAutoEnhance(analysis);
    assert.ok(suggestion.contrast > 110);
  });

  it("suggests higher brightness for dark images", () => {
    const raw = buildRaw(32, 32, (_x, _y, i, buf) => {
      buf[i] = 45;
      buf[i + 1] = 45;
      buf[i + 2] = 45;
    });
    const suggestion = suggestAutoEnhance(analyzePixels(raw, 32, 32, 3));
    assert.ok(suggestion.brightness > 100);
  });

  it("suggests negative temperature for warm casts on neutral pixels", () => {
    const raw = buildRaw(64, 64, (_x, _y, i, buf) => {
      buf[i] = 220;
      buf[i + 1] = 214;
      buf[i + 2] = 188;
    });
    const analysis = analyzePixels(raw, 64, 64, 3);
    assert.ok(analysis.neutralPixelCount > 0);
    assert.ok(suggestTemperature(analysis) < -5);
    const suggestion = suggestAutoEnhance(analysis);
    assert.ok(suggestion.temperature < -5);
    assert.ok(suggestion.temperature >= -28);
  });

  it("ignores foliage-heavy scenes when estimating white balance", () => {
    const analysis = buildOutdoorSceneAnalysis();
    const suggestion = suggestAutoEnhance(analysis);
    assert.ok(Math.abs(suggestion.temperature) <= 5);
    assert.ok(suggestion.saturation <= 102);
  });

  it("keeps saturation boost low on already saturated images", () => {
    const raw = buildRaw(32, 32, (_x, _y, i, buf) => {
      buf[i] = 230;
      buf[i + 1] = 40;
      buf[i + 2] = 40;
    });
    const analysis = analyzePixels(raw, 32, 32, 3);
    assert.equal(suggestSaturation(analysis), 100);
  });

  it("boosts saturation on pale images", () => {
    const raw = buildRaw(32, 32, (_x, _y, i, buf) => {
      buf[i] = 180;
      buf[i + 1] = 175;
      buf[i + 2] = 170;
    });
    const analysis = analyzePixels(raw, 32, 32, 3);
    assert.ok(suggestSaturation(analysis) > 105);
  });

  it("skips sharpen when computed corrections stay within tolerance", () => {
    const result = applyNoOpProtection({
      brightness: 101,
      contrast: 102,
      saturation: 101,
      temperature: -3,
    });
    assert.equal(result.sharpen, 0);
    assert.equal(result.brightness, 100);
  });

  it("returns stable values on repeated analysis", () => {
    const raw = buildRaw(48, 48, (_x, _y, i, buf) => {
      buf[i] = 95;
      buf[i + 1] = 100;
      buf[i + 2] = 105;
    });
    const analysis = analyzePixels(raw, 48, 48, 3);
    assert.deepEqual(suggestAutoEnhance(analysis), suggestAutoEnhance(analysis));
  });

  it("applyNoOpProtection snaps near-neutral suggestions to defaults", () => {
    assert.deepEqual(
      applyNoOpProtection({
        brightness: 101,
        contrast: 99,
        saturation: 101,
        temperature: 2,
      }),
      {
        brightness: 100,
        contrast: 100,
        saturation: 100,
        temperature: 0,
        sharpen: 0,
      },
    );
    assert.deepEqual(
      applyNoOpProtection({
        brightness: 115,
        contrast: 100,
        saturation: 100,
        temperature: 0,
      }),
      {
        brightness: 115,
        contrast: 100,
        saturation: 100,
        temperature: 0,
        sharpen: 17,
      },
    );
  });
});

describe("analyzeAutoEnhance", () => {
  it("detects low contrast in a flat test image", async () => {
    const raw = buildRaw(64, 64, (x, _y, i, buf) => {
      const v = 100 + Math.round((x / 63) * 15);
      buf[i] = v;
      buf[i + 1] = v;
      buf[i + 2] = v;
    });
    const suggestion = await analyzeAutoEnhance(await encodePng(raw, 64, 64));
    assert.ok(suggestion.contrast > 100);
  });

  it("detects underexposure in a dark test image", async () => {
    const raw = buildRaw(64, 64, (_x, _y, i, buf) => {
      buf[i] = 45;
      buf[i + 1] = 45;
      buf[i + 2] = 45;
    });
    const suggestion = await analyzeAutoEnhance(await encodePng(raw, 64, 64));
    assert.ok(suggestion.brightness > 100);
  });

  it("includes sharpen when a correction is suggested", async () => {
    const raw = buildRaw(64, 64, (_x, _y, i, buf) => {
      buf[i] = 60;
      buf[i + 1] = 60;
      buf[i + 2] = 60;
    });
    const suggestion = await analyzeAutoEnhance(await encodePng(raw, 64, 64));
    assert.ok(suggestion.sharpen >= 15);
  });

  it("loads raw pixels from encoded buffers", async () => {
    const raw = buildRaw(16, 16, (_x, _y, i, buf) => {
      buf[i] = 200;
      buf[i + 1] = 150;
      buf[i + 2] = 100;
    });
    const analysis = await loadRawPixels(await encodePng(raw, 16, 16));
    assert.ok(analysis.rMean > analysis.bMean);
  });
});
