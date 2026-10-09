import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  DEFAULT_IMAGE_TRANSFORM,
  DEFAULT_TRANSFORM,
  PORTRAIT_IMAGE_TRANSFORM,
  type ImageCrop,
  type LayerTransform,
} from "@/lib/carousel/types";

export const SNAP_THRESHOLD = 12;

export const VERTICAL_GUIDES = [
  CANVAS_WIDTH / 2,
  88,
  CANVAS_WIDTH - 88,
] as const;

export const HORIZONTAL_GUIDES = [
  CANVAS_HEIGHT / 2,
  200,
  CANVAS_HEIGHT - 220,
] as const;

export function normalizeTransform(
  value?: LayerTransform | null,
): LayerTransform {
  if (!value) return { ...DEFAULT_TRANSFORM };
  return {
    x: Number.isFinite(value.x) ? value.x : 0,
    y: Number.isFinite(value.y) ? value.y : 0,
    scale:
      Number.isFinite(value.scale) && value.scale > 0
        ? Math.min(3, Math.max(0.35, value.scale))
        : 1,
  };
}

export function normalizeImageTransform(
  value?: LayerTransform | null,
): LayerTransform {
  if (!value) return { ...DEFAULT_IMAGE_TRANSFORM };
  return {
    x: Number.isFinite(value.x) ? value.x : 0,
    y: Number.isFinite(value.y) ? value.y : 0,
    scale:
      Number.isFinite(value.scale) && value.scale > 0
        ? Math.min(3, Math.max(0.35, value.scale))
        : DEFAULT_IMAGE_TRANSFORM.scale,
  };
}

/** Landscape → 190% zoom; portrait/square → 100%. */
export function defaultImageTransformForSize(
  width: number,
  height: number,
): LayerTransform {
  if (!(width > 0 && height > 0)) return { ...DEFAULT_IMAGE_TRANSFORM };
  return height >= width
    ? { ...PORTRAIT_IMAGE_TRANSFORM }
    : { ...DEFAULT_IMAGE_TRANSFORM };
}

export function snapValue(
  value: number,
  guides: readonly number[],
  threshold = SNAP_THRESHOLD,
): { value: number; guide: number | null } {
  let best: number | null = null;
  let bestDist = threshold + 1;
  for (const guide of guides) {
    const dist = Math.abs(value - guide);
    if (dist <= threshold && dist < bestDist) {
      best = guide;
      bestDist = dist;
    }
  }
  return best === null
    ? { value, guide: null }
    : { value: best, guide: best };
}

/** Snap transform offsets so the layer's visual center approaches canvas guides. */
export function snapTransformOffsets(
  x: number,
  y: number,
  anchorX: number,
  anchorY: number,
): { x: number; y: number; guides: { v: number | null; h: number | null } } {
  const absX = anchorX + x;
  const absY = anchorY + y;
  const sx = snapValue(absX, VERTICAL_GUIDES);
  const sy = snapValue(absY, HORIZONTAL_GUIDES);
  return {
    x: sx.value - anchorX,
    y: sy.value - anchorY,
    guides: { v: sx.guide, h: sy.guide },
  };
}

export const MIN_LAYER_SCALE = 0.35;
export const MAX_LAYER_SCALE = 3;

export function clampLayerScale(scale: number): number {
  return Math.min(MAX_LAYER_SCALE, Math.max(MIN_LAYER_SCALE, scale));
}

/** Size of an image drawn with object-contain into the 1080×1350 frame at 100%. */
export function containedImageSize(
  width: number,
  height: number,
): { width: number; height: number } {
  if (!(width > 0 && height > 0)) {
    return { width: CANVAS_WIDTH, height: CANVAS_HEIGHT };
  }
  const fit = Math.min(CANVAS_WIDTH / width, CANVAS_HEIGHT / height);
  return { width: width * fit, height: height * fit };
}

/** Centered zoom so the photo covers the whole frame (no empty edges). */
export function fillImageTransformForSize(
  width: number,
  height: number,
): LayerTransform {
  const contained = containedImageSize(width, height);
  const scale = Math.max(
    CANVAS_WIDTH / contained.width,
    CANVAS_HEIGHT / contained.height,
  );
  return { x: 0, y: 0, scale: clampLayerScale(Math.ceil(scale * 1000) / 1000) };
}

/** Centered, whole photo visible (may leave bars). */
export function fitImageTransform(): LayerTransform {
  return { x: 0, y: 0, scale: 1 };
}

/** Smallest visible part of the photo per axis after cropping. */
export const MIN_CROP_VISIBLE = 0.05;

function clampCropEdge(value: unknown): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return Math.min(1 - MIN_CROP_VISIBLE, Math.max(0, n));
}

/** Valid crop or null when nothing is cut off (rendering stays unchanged). */
export function normalizeImageCrop(
  crop?: Partial<ImageCrop> | null,
): ImageCrop | null {
  if (!crop || !(typeof crop.aspect === "number" && crop.aspect > 0)) {
    return null;
  }
  const left = clampCropEdge(crop.left);
  let right = clampCropEdge(crop.right);
  const top = clampCropEdge(crop.top);
  let bottom = clampCropEdge(crop.bottom);
  if (left + right > 1 - MIN_CROP_VISIBLE) {
    right = Math.max(0, 1 - MIN_CROP_VISIBLE - left);
  }
  if (top + bottom > 1 - MIN_CROP_VISIBLE) {
    bottom = Math.max(0, 1 - MIN_CROP_VISIBLE - top);
  }
  if (left === 0 && right === 0 && top === 0 && bottom === 0) return null;
  return { left, top, right, bottom, aspect: crop.aspect };
}

/**
 * CSS clip-path for the (untransformed) 1080×1350 image box, where the photo
 * is drawn with object-contain.
 */
export function imageCropClipPath(crop: ImageCrop): string {
  const contained = containedImageSize(crop.aspect, 1);
  const offsetX = (CANVAS_WIDTH - contained.width) / 2;
  const offsetY = (CANVAS_HEIGHT - contained.height) / 2;
  const top = offsetY + crop.top * contained.height;
  const bottom = offsetY + crop.bottom * contained.height;
  const left = offsetX + crop.left * contained.width;
  const right = offsetX + crop.right * contained.width;
  return `inset(${top}px ${right}px ${bottom}px ${left}px)`;
}
