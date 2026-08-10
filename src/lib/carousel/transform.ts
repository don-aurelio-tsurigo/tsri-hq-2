import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  DEFAULT_IMAGE_TRANSFORM,
  DEFAULT_TRANSFORM,
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
