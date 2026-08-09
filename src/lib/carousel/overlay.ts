import type { ImageOverlay } from "@/lib/carousel/types";

/** Soft bottom fade; top of the ramp stays transparent (opacity 0). */
export const DEFAULT_IMAGE_OVERLAY: ImageOverlay = {
  dim: 0,
  gradientStrength: 0.55,
  gradientLift: 1,
};

function clamp01(value: number) {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function normalizeImageOverlay(
  overlay?: Partial<ImageOverlay> | null,
): ImageOverlay {
  return {
    dim: clamp01(overlay?.dim ?? DEFAULT_IMAGE_OVERLAY.dim),
    gradientStrength: clamp01(
      overlay?.gradientStrength ?? DEFAULT_IMAGE_OVERLAY.gradientStrength,
    ),
    gradientLift: clamp01(
      overlay?.gradientLift ?? DEFAULT_IMAGE_OVERLAY.gradientLift,
    ),
  };
}

/** Flat image darken via CSS brightness (1 = unchanged, lower = darker). */
export function imageDimFilter(dim: number): string {
  const brightness = 1 - clamp01(dim) * 0.85;
  return `brightness(${brightness})`;
}

/**
 * Bottom-heavy darken gradient.
 * - gradientStrength: opacity at the bottom (0–1)
 * - gradientLift: how far up the ramp reaches (0 = thin bottom edge, 1 = full height)
 *
 * Always starts at opacity 0 at the top of the ramp (no hard step).
 */
export function imageOverlayGradient(overlay: ImageOverlay): string {
  const s = clamp01(overlay.gradientStrength);
  const lift = clamp01(overlay.gradientLift);
  const start = Math.round((1 - lift) * 100);
  const span = Math.max(100 - start, 1);
  const mid = Math.round(start + span * 0.45);
  const midA = (s * 0.35).toFixed(3);
  const botA = s.toFixed(3);

  if (start <= 0) {
    return `linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,${midA}) ${mid}%, rgba(0,0,0,${botA}) 100%)`;
  }

  return `linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0) ${start}%, rgba(0,0,0,${midA}) ${mid}%, rgba(0,0,0,${botA}) 100%)`;
}
