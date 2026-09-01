import sharp from "sharp";

export type AutoEnhanceSuggestion = {
  brightness: number;
  contrast: number;
  saturation: number;
  temperature: number;
  sharpen: number;
};

export type PixelAnalysis = {
  histR: Uint32Array;
  histG: Uint32Array;
  histB: Uint32Array;
  pixelCount: number;
  rMean: number;
  gMean: number;
  bMean: number;
  avgSaturation: number;
  neutralPixelCount: number;
  neutralRMean: number;
  neutralGMean: number;
  neutralBMean: number;
};

const SLIDER_MIN = 50;
const SLIDER_MAX = 200;
const NEUTRAL = 100;
const TEMP_MIN = -100;
const TEMP_MAX = 100;
const SHARPEN_SUGGESTION = 17;

const PERCENTILE_LOW = 0.01;
const PERCENTILE_HIGH = 0.99;
const CONTRAST_MAX_BOOST = 70;
const BRIGHTNESS_FACTOR = 0.35;
const SATURATION_MAX_BOOST = 12;
const SATURATION_ALREADY_VIVID = 0.38;

/** Only pixels at or below this HSV saturation count as neutral for white balance. */
const NEUTRAL_SAT_THRESHOLD = 0.2;
const NEUTRAL_PIXEL_MIN_RATIO = 0.008;
const NEUTRAL_PIXEL_MIN_COUNT = 400;

/** Auto-enhance temperature stays conservative — the CSS filter is very strong at ±100. */
const TEMPERATURE_FACTOR = 0.85;
const TEMPERATURE_SUGGESTION_MAX = 28;

const NO_OP_TOLERANCE = {
  brightness: 3,
  contrast: 3,
  saturation: 2,
  temperature: 5,
  sharpen: 3,
};

const NEUTRAL_SUGGESTION: AutoEnhanceSuggestion = {
  brightness: NEUTRAL,
  contrast: NEUTRAL,
  saturation: NEUTRAL,
  temperature: 0,
  sharpen: 0,
};

function clampSlider(value: number): number {
  return Math.min(SLIDER_MAX, Math.max(SLIDER_MIN, Math.round(value)));
}

function clampTemperature(value: number): number {
  return Math.min(TEMP_MAX, Math.max(TEMP_MIN, Math.round(value)));
}

function clampTemperatureSuggestion(value: number): number {
  return Math.min(
    TEMPERATURE_SUGGESTION_MAX,
    Math.max(-TEMPERATURE_SUGGESTION_MAX, Math.round(value)),
  );
}

function clampSharpen(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function percentileFromHistogram(hist: Uint32Array, p: number): number {
  const total = hist.reduce((sum, count) => sum + count, 0);
  if (total <= 0) return 0;
  const target = total * p;
  let cumulative = 0;
  for (let value = 0; value < hist.length; value += 1) {
    cumulative += hist[value] ?? 0;
    if (cumulative >= target) return value;
  }
  return hist.length - 1;
}

export function rgbToSaturation(r: number, g: number, b: number): number {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  if (max <= 0) return 0;
  return (max - min) / max;
}

/** Build histograms and sampled saturation from an RGB buffer. */
export function analyzePixels(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
): PixelAnalysis {
  const histR = new Uint32Array(256);
  const histG = new Uint32Array(256);
  const histB = new Uint32Array(256);
  const pixelCount = width * height;

  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let satSum = 0;
  let satSamples = 0;
  let neutralPixelCount = 0;
  let neutralRSum = 0;
  let neutralGSum = 0;
  let neutralBSum = 0;

  for (let i = 0; i < pixelCount; i += 1) {
    const offset = i * channels;
    const r = data[offset] ?? 0;
    const g = data[offset + 1] ?? 0;
    const b = data[offset + 2] ?? 0;
    histR[r] = (histR[r] ?? 0) + 1;
    histG[g] = (histG[g] ?? 0) + 1;
    histB[b] = (histB[b] ?? 0) + 1;
    rSum += r;
    gSum += g;
    bSum += b;

    const saturation = rgbToSaturation(r, g, b);
    if (i % 4 === 0) {
      satSum += saturation;
      satSamples += 1;
    }

    if (saturation <= NEUTRAL_SAT_THRESHOLD) {
      neutralPixelCount += 1;
      neutralRSum += r;
      neutralGSum += g;
      neutralBSum += b;
    }
  }

  const rMean = pixelCount > 0 ? rSum / pixelCount : 0;
  const gMean = pixelCount > 0 ? gSum / pixelCount : 0;
  const bMean = pixelCount > 0 ? bSum / pixelCount : 0;

  return {
    histR,
    histG,
    histB,
    pixelCount,
    rMean,
    gMean,
    bMean,
    avgSaturation: satSamples > 0 ? satSum / satSamples : 0,
    neutralPixelCount,
    neutralRMean: neutralPixelCount > 0 ? neutralRSum / neutralPixelCount : rMean,
    neutralGMean: neutralPixelCount > 0 ? neutralGSum / neutralPixelCount : gMean,
    neutralBMean: neutralPixelCount > 0 ? neutralBSum / neutralPixelCount : bMean,
  };
}

export function hasReliableNeutralSample(analysis: PixelAnalysis): boolean {
  const minNeutral = Math.max(
    NEUTRAL_PIXEL_MIN_COUNT,
    Math.floor(analysis.pixelCount * NEUTRAL_PIXEL_MIN_RATIO),
  );
  return analysis.neutralPixelCount >= minNeutral;
}

export function percentileSpan(analysis: PixelAnalysis): number {
  const spans = [
    percentileFromHistogram(analysis.histR, PERCENTILE_HIGH) -
      percentileFromHistogram(analysis.histR, PERCENTILE_LOW),
    percentileFromHistogram(analysis.histG, PERCENTILE_HIGH) -
      percentileFromHistogram(analysis.histG, PERCENTILE_LOW),
    percentileFromHistogram(analysis.histB, PERCENTILE_HIGH) -
      percentileFromHistogram(analysis.histB, PERCENTILE_LOW),
  ];
  return spans.reduce((sum, span) => sum + span, 0) / spans.length;
}

function percentileMidMean(analysis: PixelAnalysis): number {
  const mids = [
    (percentileFromHistogram(analysis.histR, PERCENTILE_LOW) +
      percentileFromHistogram(analysis.histR, PERCENTILE_HIGH)) /
      2,
    (percentileFromHistogram(analysis.histG, PERCENTILE_LOW) +
      percentileFromHistogram(analysis.histG, PERCENTILE_HIGH)) /
      2,
    (percentileFromHistogram(analysis.histB, PERCENTILE_LOW) +
      percentileFromHistogram(analysis.histB, PERCENTILE_HIGH)) /
      2,
  ];
  return mids.reduce((sum, mid) => sum + mid, 0) / mids.length;
}

/**
 * White balance from low-saturation pixels only (shirts, walls, stone).
 * Corrects warm/cool cast on the R↔B axis — ignores green foliage in the scene.
 */
export function suggestTemperature(analysis: PixelAnalysis): number {
  if (!hasReliableNeutralSample(analysis)) return 0;

  const r = analysis.neutralRMean;
  const g = analysis.neutralGMean;
  const b = analysis.neutralBMean;
  const rbAvg = (r + b) / 2;
  if (rbAvg <= 0) return 0;

  // If neutral areas already look green-shifted, don't fight the scene with temperature.
  const greenShift = g - rbAvg;
  if (greenShift > 12) return 0;

  const rbDiff = r - b;
  if (Math.abs(rbDiff) < 4) return 0;

  return clampTemperatureSuggestion(-rbDiff * TEMPERATURE_FACTOR);
}

export function suggestSaturation(analysis: PixelAnalysis): number {
  if (analysis.avgSaturation >= SATURATION_ALREADY_VIVID) {
    return NEUTRAL;
  }
  const headroom = 1 - Math.min(1, Math.max(0, analysis.avgSaturation));
  const boost = headroom * SATURATION_MAX_BOOST;
  return clampSlider(NEUTRAL + boost);
}

export function applyNoOpProtection(
  suggestion: Pick<AutoEnhanceSuggestion, "brightness" | "contrast" | "saturation" | "temperature">,
): AutoEnhanceSuggestion {
  const needsCorrection =
    Math.abs(suggestion.brightness - NEUTRAL) > NO_OP_TOLERANCE.brightness ||
    Math.abs(suggestion.contrast - NEUTRAL) > NO_OP_TOLERANCE.contrast ||
    Math.abs(suggestion.saturation - NEUTRAL) > NO_OP_TOLERANCE.saturation ||
    Math.abs(suggestion.temperature) > NO_OP_TOLERANCE.temperature;

  if (!needsCorrection) return { ...NEUTRAL_SUGGESTION };
  return {
    ...suggestion,
    sharpen: clampSharpen(SHARPEN_SUGGESTION),
  };
}

/** Map pixel statistics to editor slider values. */
export function suggestAutoEnhance(analysis: PixelAnalysis): AutoEnhanceSuggestion {
  if (analysis.pixelCount <= 0) {
    return { ...NEUTRAL_SUGGESTION };
  }

  const clippedSpan = percentileSpan(analysis);
  const usage = clippedSpan / 255;
  const contrast = clampSlider(NEUTRAL + (1 - usage) * CONTRAST_MAX_BOOST);

  const clippedMean = percentileMidMean(analysis);
  const brightness = clampSlider(NEUTRAL + (127 - clippedMean) * BRIGHTNESS_FACTOR);

  const saturation = suggestSaturation(analysis);
  const temperature = suggestTemperature(analysis);

  return applyNoOpProtection({
    brightness,
    contrast,
    saturation,
    temperature,
  });
}

export async function analyzeAutoEnhance(buffer: Buffer): Promise<AutoEnhanceSuggestion> {
  const { data, info } = await sharp(buffer)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const analysis = analyzePixels(data, info.width, info.height, info.channels);
  return suggestAutoEnhance(analysis);
}

export async function loadRawPixels(buffer: Buffer): Promise<PixelAnalysis> {
  const { data, info } = await sharp(buffer)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return analyzePixels(data, info.width, info.height, info.channels);
}

/** Compare percentile span vs absolute min/max span (for tests). */
export function minMaxSpan(analysis: PixelAnalysis): number {
  function minMax(hist: Uint32Array): number {
    let min = 0;
    let max = 255;
    for (let i = 0; i < hist.length; i += 1) {
      if ((hist[i] ?? 0) > 0) {
        min = i;
        break;
      }
    }
    for (let i = hist.length - 1; i >= 0; i -= 1) {
      if ((hist[i] ?? 0) > 0) {
        max = i;
        break;
      }
    }
    return max - min;
  }
  return (minMax(analysis.histR) + minMax(analysis.histG) + minMax(analysis.histB)) / 3;
}

/** Simulate a foliage-heavy outdoor frame with neutral highlights (for tests). */
export function buildOutdoorSceneAnalysis(): PixelAnalysis {
  const width = 160;
  const height = 120;
  const raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 3;
      const isNeutral =
        (x > 20 && x < 48 && y > 70 && y < 110) || (x > 90 && x < 130 && y < 35);
      if (isNeutral) {
        raw[i] = 225;
        raw[i + 1] = 224;
        raw[i + 2] = 223;
      } else if (x < width * 0.55) {
        raw[i] = 55;
        raw[i + 1] = 125;
        raw[i + 2] = 48;
      } else {
        raw[i] = 198;
        raw[i + 1] = 176;
        raw[i + 2] = 118;
      }
    }
  }
  return analyzePixels(raw, width, height, 3);
}
