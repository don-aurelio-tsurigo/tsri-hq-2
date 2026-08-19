import type { ImageOverlay } from "@/lib/carousel/types";

/** Soft bottom fade used on cover photos. */
export const DEFAULT_IMAGE_OVERLAY: ImageOverlay = {
  dim: 0,
  gradientStrength: 0.5,
  gradientLift: 0.6,
  gradientFromTop: false,
};

/** Text/quote photos: no gradient by default. */
export const DEFAULT_TEXT_QUOTE_IMAGE_OVERLAY: ImageOverlay = {
  dim: 0,
  gradientStrength: 0,
  gradientLift: 0.6,
  gradientFromTop: false,
};

function clamp01(value: number) {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function normalizeImageOverlay(
  overlay?: Partial<ImageOverlay> | null,
  defaults: ImageOverlay = DEFAULT_IMAGE_OVERLAY,
): ImageOverlay {
  return {
    dim: clamp01(overlay?.dim ?? defaults.dim),
    gradientStrength: clamp01(
      overlay?.gradientStrength ?? defaults.gradientStrength,
    ),
    gradientLift: clamp01(overlay?.gradientLift ?? defaults.gradientLift),
    gradientFromTop: overlay?.gradientFromTop ?? defaults.gradientFromTop ?? false,
  };
}

export function defaultImageOverlayForSlideType(
  type: "cover" | "text" | "quote" | "outro" | "tipp-item",
): ImageOverlay {
  if (type === "text" || type === "quote" || type === "tipp-item") {
    return { ...DEFAULT_TEXT_QUOTE_IMAGE_OVERLAY };
  }
  return { ...DEFAULT_IMAGE_OVERLAY };
}

/** Flat image darken via CSS brightness (1 = unchanged, lower = darker). */
export function imageDimFilter(dim: number): string {
  const brightness = 1 - clamp01(dim) * 0.85;
  return `brightness(${brightness})`;
}

/**
 * Darken gradient from one edge.
 * - gradientStrength (UI: Verlauf Stärke): opacity at the dark edge (0–1)
 * - gradientLift (UI: Verlauf Höhe): how far the ramp reaches (0 = thin edge, 1 = full height)
 * - gradientFromTop: dark at top fading down; default is dark at the bottom
 *
 * Always starts at opacity 0 at the light end of the ramp (no hard step).
 */
export function imageOverlayGradient(overlay: ImageOverlay): string {
  const s = clamp01(overlay.gradientStrength);
  const lift = clamp01(overlay.gradientLift);
  const start = Math.round((1 - lift) * 100);
  const span = Math.max(100 - start, 1);
  const mid = Math.round(start + span * 0.45);
  const midA = (s * 0.35).toFixed(3);
  const botA = s.toFixed(3);

  if (overlay.gradientFromTop) {
    const midRev = 100 - mid;
    const startRev = 100 - start;
    if (start <= 0) {
      return `linear-gradient(180deg, rgba(0,0,0,${botA}) 0%, rgba(0,0,0,${midA}) ${midRev}%, rgba(0,0,0,0) 100%)`;
    }
    return `linear-gradient(180deg, rgba(0,0,0,${botA}) 0%, rgba(0,0,0,${midA}) ${midRev}%, rgba(0,0,0,0) ${startRev}%, rgba(0,0,0,0) 100%)`;
  }

  if (start <= 0) {
    return `linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,${midA}) ${mid}%, rgba(0,0,0,${botA}) 100%)`;
  }

  return `linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0) ${start}%, rgba(0,0,0,${midA}) ${mid}%, rgba(0,0,0,${botA}) 100%)`;
}
