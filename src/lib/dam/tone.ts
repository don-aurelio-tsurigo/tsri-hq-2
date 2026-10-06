import type { DamEditParams } from "@/lib/dam/edit-params";

/**
 * Colour/tone maths shared by the server render (sharp raw buffers) and the
 * editor preview (canvas ImageData), so what you see is what gets exported.
 *
 * Order: white balance (linear light) → levels → brightness (gamma) →
 * contrast (S-curve) → saturation (luma-preserving). Sharpening is an output
 * step and lives in apply-edits.ts.
 */

export type ToneParams = Pick<
  DamEditParams,
  "brightness" | "contrast" | "saturation" | "temperature" | "blackPoint" | "whitePoint"
>;

export type ToneLuts = { r: Uint8Array; g: Uint8Array; b: Uint8Array };

/** Linear-light channel gains at temperature ±100 (warm = more red, less blue). */
const TEMPERATURE_GAIN = 0.25;

const LUMA_R = 0.2126;
const LUMA_G = 0.7152;
const LUMA_B = 0.0722;

export function isNeutralTone(params: ToneParams): boolean {
  return (
    params.brightness === 100 &&
    params.contrast === 100 &&
    params.saturation === 100 &&
    params.temperature === 0 &&
    params.blackPoint === 0 &&
    params.whitePoint === 255
  );
}

function srgbToLinear(x: number): number {
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
}

function linearToSrgb(x: number): number {
  return x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** Per-channel white-balance gains in linear light, normalised to keep luma. */
export function temperatureGains(temperature: number): { r: number; g: number; b: number } {
  const t = Math.min(100, Math.max(-100, temperature)) / 100;
  const r = 1 + TEMPERATURE_GAIN * t;
  const b = 1 - TEMPERATURE_GAIN * t;
  const luma = LUMA_R * r + LUMA_G + LUMA_B * b;
  return { r: r / luma, g: 1 / luma, b: b / luma };
}

/** Brightness slider (50–200) → gamma exponent; lifts mid-tones, keeps white at white. */
export function brightnessExponent(brightness: number): number {
  return Math.pow(2, -(brightness - 100) / 100);
}

/**
 * Contrast S-curve x^a / (x^a + (1-x)^a): fixed end points (no hard clipping),
 * slope `a` at mid-grey. a = contrast/100, so 100 is identity.
 */
export function contrastCurve(x: number, contrast: number): number {
  const a = contrast / 100;
  if (a === 1 || x <= 0 || x >= 1) return x;
  const p = Math.pow(x, a);
  return p / (p + Math.pow(1 - x, a));
}

function buildChannelLut(gain: number, params: ToneParams): Uint8Array {
  const lut = new Uint8Array(256);
  const black = params.blackPoint / 255;
  const white = Math.max(black + 1 / 255, params.whitePoint / 255);
  const exponent = brightnessExponent(params.brightness);
  for (let v = 0; v < 256; v += 1) {
    let x = v / 255;
    if (gain !== 1) x = linearToSrgb(clamp01(srgbToLinear(x) * gain));
    x = clamp01((x - black) / (white - black));
    if (exponent !== 1) x = Math.pow(x, exponent);
    x = contrastCurve(x, params.contrast);
    lut[v] = Math.round(clamp01(x) * 255);
  }
  return lut;
}

export function buildToneLuts(params: ToneParams): ToneLuts {
  const gains = temperatureGains(params.temperature);
  return {
    r: buildChannelLut(gains.r, params),
    g: buildChannelLut(gains.g, params),
    b: buildChannelLut(gains.b, params),
  };
}

/**
 * Apply tone edits in place to interleaved 8-bit pixels (3 = RGB, 4 = RGBA;
 * alpha untouched). Works on Node Buffers and canvas Uint8ClampedArrays.
 */
export function applyToneToPixels(
  data: Uint8Array | Uint8ClampedArray,
  channels: number,
  params: ToneParams,
): void {
  if (channels < 3 || isNeutralTone(params)) return;
  const luts = buildToneLuts(params);
  const s = params.saturation / 100;
  for (let i = 0; i + 2 < data.length; i += channels) {
    let r = luts.r[data[i]!]!;
    let g = luts.g[data[i + 1]!]!;
    let b = luts.b[data[i + 2]!]!;
    if (s !== 1) {
      const l = LUMA_R * r + LUMA_G * g + LUMA_B * b;
      r = l + (r - l) * s;
      g = l + (g - l) * s;
      b = l + (b - l) * s;
      r = r < 0 ? 0 : r > 255 ? 255 : Math.round(r);
      g = g < 0 ? 0 : g > 255 ? 255 : Math.round(g);
      b = b < 0 ? 0 : b > 255 ? 255 : Math.round(b);
    }
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
}
