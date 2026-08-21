export type DamCrop = {
  unit: "%";
  x: number;
  y: number;
  width: number;
  height: number;
};

export const DAM_ASPECT_PRESETS = ["free", "1:1", "16:9", "4:3", "3:2"] as const;
export type DamAspectRatio = (typeof DAM_ASPECT_PRESETS)[number] | null;

export type DamEditParams = {
  brightness: number;
  saturation: number;
  contrast: number;
  rotate: number;
  flipHorizontal: boolean;
  flipVertical: boolean;
  crop: DamCrop | null;
  aspectRatio: DamAspectRatio;
  sharpen: number;
  temperature: number;
};

export const DEFAULT_EDIT_PARAMS: DamEditParams = {
  brightness: 100,
  saturation: 100,
  contrast: 100,
  rotate: 0,
  flipHorizontal: false,
  flipVertical: false,
  crop: null,
  aspectRatio: null,
  sharpen: 0,
  temperature: 0,
};

function asNumber(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function asBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  return fallback;
}

function asAspectRatio(value: unknown): DamAspectRatio {
  if (value === null || value === undefined || value === "free") return value === "free" ? "free" : null;
  if (value === "1:1" || value === "16:9" || value === "4:3" || value === "3:2") return value;
  return null;
}

export function aspectRatioValue(ratio: DamAspectRatio): number | undefined {
  if (!ratio || ratio === "free") return undefined;
  const [a, b] = ratio.split(":").map(Number);
  if (!a || !b) return undefined;
  return a / b;
}

export function splitRotate(rotate: number): { quarter: number; straighten: number } {
  const r = ((rotate % 360) + 360) % 360;
  let quarter = Math.round(r / 90) * 90;
  let straighten = r - quarter;
  if (quarter === 360) {
    quarter = 0;
    straighten = r - 360;
  }
  return { quarter, straighten };
}

export function joinRotate(quarter: number, straighten: number): number {
  return ((quarter + straighten) % 360 + 360) % 360;
}

export function frameAfterQuarter(
  width: number,
  height: number,
  rotate: number,
): { width: number; height: number } {
  const { quarter } = splitRotate(rotate);
  if (quarter === 90 || quarter === 270) return { width: height, height: width };
  return { width, height };
}

/** Zoom so a non-orthogonal straighten fills the frame (no black corners). */
export function straightenCoverScale(
  width: number,
  height: number,
  rotate: number,
): number {
  const { straighten } = splitRotate(rotate);
  const abs = Math.abs(straighten);
  if (abs < 0.01) return 1;
  const frame = frameAfterQuarter(width, height, rotate);
  const rad = (abs * Math.PI) / 180;
  const sin = Math.sin(rad);
  const cos = Math.cos(rad);
  const w = Math.max(1, frame.width);
  const h = Math.max(1, frame.height);
  return Math.max(cos + (h / w) * sin, cos + (w / h) * sin);
}

export function straightenCoverExtract(
  srcWidth: number,
  srcHeight: number,
  rotate: number,
): { left: number; top: number; width: number; height: number } | null {
  const scale = straightenCoverScale(srcWidth, srcHeight, rotate);
  if (scale <= 1.0001) return null;
  const angle = ((rotate % 360) + 360) % 360;
  const bbox = rotatedBoundingBox(srcWidth, srcHeight, angle);
  const frame = frameAfterQuarter(srcWidth, srcHeight, rotate);
  const width = Math.min(bbox.width, frame.width / scale);
  const height = Math.min(bbox.height, frame.height / scale);
  const left = (bbox.width - width) / 2;
  const top = (bbox.height - height) / 2;
  return {
    left: Math.max(0, Math.floor(left)),
    top: Math.max(0, Math.floor(top)),
    width: Math.max(1, Math.floor(width)),
    height: Math.max(1, Math.floor(height)),
  };
}

export type DamMediaSize = {
  width?: number | null;
  height?: number | null;
};

export function parseEditParams(raw: unknown): DamEditParams {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_EDIT_PARAMS };
  const obj = raw as Record<string, unknown>;
  let crop: DamCrop | null = null;
  if (obj.crop && typeof obj.crop === "object") {
    const c = obj.crop as Record<string, unknown>;
    const width = asNumber(c.width, 0, 0, 100);
    const height = asNumber(c.height, 0, 0, 100);
    if (width >= 2 && height >= 2 && (width < 99.5 || height < 99.5)) {
      crop = {
        unit: "%",
        x: asNumber(c.x, 0, 0, 100),
        y: asNumber(c.y, 0, 0, 100),
        width,
        height,
      };
    }
  }
  const rotate = asNumber(obj.rotate, 0, 0, 360);
  return {
    brightness: asNumber(obj.brightness, 100, 50, 200),
    saturation: asNumber(obj.saturation, 100, 50, 200),
    contrast: asNumber(obj.contrast, 100, 50, 200),
    rotate: rotate === 360 ? 0 : rotate,
    flipHorizontal: asBoolean(obj.flipHorizontal),
    flipVertical: asBoolean(obj.flipVertical),
    crop,
    aspectRatio: asAspectRatio(obj.aspectRatio),
    sharpen: asNumber(obj.sharpen, 0, 0, 100),
    temperature: asNumber(obj.temperature, 0, -100, 100),
  };
}

export function cssFilter(params: DamEditParams): string {
  const extraContrast = 1 + params.sharpen / 400;
  const contrast = (params.contrast / 100) * extraContrast;
  const parts = [
    `brightness(${params.brightness / 100})`,
    `saturate(${params.saturation / 100})`,
    `contrast(${contrast})`,
  ];
  if (params.temperature > 0) {
    const t = params.temperature / 100;
    parts.push(`sepia(${(t * 0.35).toFixed(3)})`);
    parts.push(`hue-rotate(${(t * -12).toFixed(2)}deg)`);
  } else if (params.temperature < 0) {
    const t = -params.temperature / 100;
    parts.push(`hue-rotate(${(t * 160).toFixed(2)}deg)`);
    parts.push(`saturate(${(1 + t * 0.12).toFixed(3)})`);
  }
  return parts.join(" ");
}

export function cssTransform(
  params: DamEditParams,
  media?: DamMediaSize,
): string | undefined {
  const parts: string[] = [];
  if (params.flipHorizontal) parts.push("scaleX(-1)");
  if (params.flipVertical) parts.push("scaleY(-1)");
  const cover = straightenCoverScale(media?.width ?? 3, media?.height ?? 2, params.rotate);
  if (cover > 1.001) parts.push(`scale(${cover})`);
  if (params.rotate) parts.push(`rotate(${params.rotate}deg)`);
  return parts.length > 0 ? parts.join(" ") : undefined;
}

export function cssClipPath(crop: DamCrop | null): string | undefined {
  if (!crop) return undefined;
  const top = crop.y;
  const right = 100 - crop.x - crop.width;
  const bottom = 100 - crop.y - crop.height;
  const left = crop.x;
  return `inset(${top}% ${right}% ${bottom}% ${left}%)`;
}

export function cssPreviewStyle(
  params: DamEditParams,
  media?: DamMediaSize,
): {
  filter: string;
  transform?: string;
  clipPath?: string;
} {
  return {
    filter: cssFilter(params),
    transform: cssTransform(params, media),
    clipPath: cssClipPath(params.crop),
  };
}

export function editParamsRev(params: DamEditParams): string {
  const crop = params.crop;
  return [
    Math.round(params.rotate * 100),
    params.brightness,
    params.saturation,
    params.contrast,
    params.flipHorizontal ? 1 : 0,
    params.flipVertical ? 1 : 0,
    params.sharpen,
    params.temperature,
    crop
      ? [crop.x, crop.y, crop.width, crop.height].map((n) => Math.round(n * 10)).join("x")
      : "0",
  ].join("-");
}

export function damFileSrc(
  assetId: string,
  variant: "thumb" | "web" | "original",
  params?: DamEditParams,
): string {
  const path = `/api/dam/assets/${assetId}/file?variant=${variant}`;
  if (variant === "original" || !params) return path;
  return `${path}&r=${editParamsRev(params)}`;
}

export function rotatedBoundingBox(
  width: number,
  height: number,
  degrees: number,
): { width: number; height: number } {
  const rad = ((degrees % 360) * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  return {
    width: width * cos + height * sin,
    height: width * sin + height * cos,
  };
}

export function cropToExtract(
  crop: DamCrop,
  width: number,
  height: number,
): { left: number; top: number; width: number; height: number } {
  const left = Math.min(width - 1, Math.max(0, Math.round((crop.x / 100) * width)));
  const top = Math.min(height - 1, Math.max(0, Math.round((crop.y / 100) * height)));
  const w = Math.min(width - left, Math.max(1, Math.round((crop.width / 100) * width)));
  const h = Math.min(height - top, Math.max(1, Math.round((crop.height / 100) * height)));
  return { left, top, width: w, height: h };
}

export function clampExtract(
  region: { left: number; top: number; width: number; height: number },
  width: number,
  height: number,
): { left: number; top: number; width: number; height: number } {
  const left = Math.min(width - 1, Math.max(0, region.left));
  const top = Math.min(height - 1, Math.max(0, region.top));
  return {
    left,
    top,
    width: Math.min(width - left, Math.max(1, region.width)),
    height: Math.min(height - top, Math.max(1, region.height)),
  };
}

export function temperatureToRgb(temp: number): { r: number; g: number; b: number } {
  const t = Math.min(100, Math.max(-100, temp));
  if (t === 0) return { r: 255, g: 255, b: 255 };
  if (t > 0) {
    const a = t / 100;
    return {
      r: 255,
      g: Math.round(255 - 30 * a),
      b: Math.round(255 - 90 * a),
    };
  }
  const a = -t / 100;
  return {
    r: Math.round(255 - 90 * a),
    g: Math.round(255 - 25 * a),
    b: 255,
  };
}
