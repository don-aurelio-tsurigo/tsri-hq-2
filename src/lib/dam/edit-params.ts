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
  /** Levels: input value mapped to black (0–254). Set by «Verbessern». */
  blackPoint: number;
  /** Levels: input value mapped to white (1–255). Set by «Verbessern». */
  whitePoint: number;
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
  blackPoint: 0,
  whitePoint: 255,
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

/** Keep at least a 16-step input range so levels never collapse the image. */
function parseLevels(
  rawBlack: unknown,
  rawWhite: unknown,
): { blackPoint: number; whitePoint: number } {
  const blackPoint = asNumber(rawBlack, 0, 0, 239);
  const whitePoint = asNumber(rawWhite, 255, 16, 255);
  if (whitePoint - blackPoint < 16) return { blackPoint: 0, whitePoint: 255 };
  return { blackPoint, whitePoint };
}

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
    ...parseLevels(obj.blackPoint, obj.whitePoint),
  };
}

/** True when colour/sharpen sliders match the neutral defaults. */
export function isNeutralColourParams(params: DamEditParams): boolean {
  return (
    params.brightness === DEFAULT_EDIT_PARAMS.brightness &&
    params.saturation === DEFAULT_EDIT_PARAMS.saturation &&
    params.contrast === DEFAULT_EDIT_PARAMS.contrast &&
    params.sharpen === DEFAULT_EDIT_PARAMS.sharpen &&
    params.temperature === DEFAULT_EDIT_PARAMS.temperature &&
    params.blackPoint === DEFAULT_EDIT_PARAMS.blackPoint &&
    params.whitePoint === DEFAULT_EDIT_PARAMS.whitePoint
  );
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
  transform?: string;
  clipPath?: string;
} {
  return {
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
    // Levels + tone-pipeline version: bumping it re-renders cached derivatives.
    `t2l${params.blackPoint}w${params.whitePoint}`,
    crop
      ? [crop.x, crop.y, crop.width, crop.height].map((n) => Math.round(n * 10)).join("x")
      : "0",
  ].join("-");
}

const DEFAULT_EDIT_REV = editParamsRev(DEFAULT_EDIT_PARAMS);

export function isDefaultEditParams(raw: unknown): boolean {
  return editParamsRev(parseEditParams(raw)) === DEFAULT_EDIT_REV;
}

export function damFileSrc(
  assetId: string,
  variant: "thumb" | "web" | "original",
  params?: DamEditParams,
): string {
  const path = `/api/dam/assets/${assetId}/file?variant=${variant}`;
  if (variant === "original" || !params) return path;
  // `v=2` busts browsers that cached unedited thumbs under an optimistic `r=`.
  return `${path}&r=${editParamsRev(params)}&v=2`;
}

/** Orientation-baked web preview without stored edit recipe (editor canvas). */
export function damEditorSrc(assetId: string): string {
  // `b=2`: browsers cached base=1 responses that were really the edited render.
  return `/api/dam/assets/${assetId}/file?variant=web&base=1&b=2`;
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
