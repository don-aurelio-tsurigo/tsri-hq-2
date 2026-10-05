import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_EDIT_PARAMS } from "./edit-params.ts";
import {
  applyToneToPixels,
  brightnessExponent,
  buildToneLuts,
  contrastCurve,
  isNeutralTone,
  temperatureGains,
} from "./tone.ts";

function pixel(r: number, g: number, b: number, params: Partial<typeof DEFAULT_EDIT_PARAMS>) {
  const data = new Uint8Array([r, g, b]);
  applyToneToPixels(data, 3, { ...DEFAULT_EDIT_PARAMS, ...params });
  return [...data];
}

describe("tone", () => {
  it("is an identity at default params", () => {
    assert.equal(isNeutralTone(DEFAULT_EDIT_PARAMS), true);
    const luts = buildToneLuts(DEFAULT_EDIT_PARAMS);
    for (let v = 0; v < 256; v += 1) assert.equal(luts.r[v], v);
    assert.deepEqual(pixel(12, 130, 250, {}), [12, 130, 250]);
  });

  it("warms by shifting red/blue, not by rotating hue", () => {
    const [r, g, b] = pixel(128, 128, 128, { temperature: 60 });
    assert.ok(r! > 128 && b! < 128, `got ${r},${g},${b}`);
    // A blue sky stays blue when cooled — the old hue rotation turned it orange.
    const [sr, , sb] = pixel(70, 130, 220, { temperature: -60 });
    assert.ok(sb! > sr!);
  });

  it("keeps luma roughly constant across white-balance gains", () => {
    for (const t of [-100, -40, 40, 100]) {
      const gains = temperatureGains(t);
      const luma = 0.2126 * gains.r + 0.7152 * gains.g + 0.0722 * gains.b;
      assert.ok(Math.abs(luma - 1) < 1e-9);
    }
  });

  it("contrast S-curve keeps black and white instead of clipping", () => {
    assert.equal(contrastCurve(0, 180), 0);
    assert.equal(contrastCurve(1, 180), 1);
    assert.equal(contrastCurve(0.5, 180), 0.5);
    assert.ok(contrastCurve(0.25, 180) < 0.25);
    assert.ok(contrastCurve(0.9, 180) < 1);
    const luts = buildToneLuts({ ...DEFAULT_EDIT_PARAMS, contrast: 180 });
    assert.ok(luts.g[245]! < 255, "near-white keeps detail");
    assert.ok(luts.g[10]! > 0, "near-black keeps detail");
  });

  it("brightness lifts mid-tones but never blows out white", () => {
    assert.equal(brightnessExponent(100), 1);
    const luts = buildToneLuts({ ...DEFAULT_EDIT_PARAMS, brightness: 160 });
    assert.ok(luts.g[100]! > 130);
    assert.equal(luts.g[255], 255);
    assert.ok(luts.g[240]! < 255);
  });

  it("levels map black/white points to 0 and 255", () => {
    const luts = buildToneLuts({ ...DEFAULT_EDIT_PARAMS, blackPoint: 20, whitePoint: 220 });
    assert.equal(luts.g[20], 0);
    assert.equal(luts.g[220], 255);
    assert.ok(Math.abs(luts.g[120]! - 128) <= 1);
  });

  it("saturation keeps greys grey and alpha untouched", () => {
    assert.deepEqual(pixel(90, 90, 90, { saturation: 180 }), [90, 90, 90]);
    const rgba = new Uint8ClampedArray([200, 100, 50, 77]);
    applyToneToPixels(rgba, 4, { ...DEFAULT_EDIT_PARAMS, saturation: 50 });
    assert.equal(rgba[3], 77);
    assert.ok(rgba[0]! - rgba[2]! < 150);
  });
});
