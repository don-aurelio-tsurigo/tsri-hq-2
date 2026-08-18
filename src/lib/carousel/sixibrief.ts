import type { SlideInk } from "@/lib/carousel/categories";

/** Top bar from the 6iBrief Canva templates. */
export const SIXIBRIEF_BAR = "#5d57f5";
export const SIXIBRIEF_BAR_HEIGHT = 22;
export const SIXIBRIEF_BG = "#ffffff";
export const SIXIBRIEF_INK: SlideInk = "dark";

export const SIXIBRIEF_DEFAULT_OVERLINE = "6iBRIEF";
export const SIXIBRIEF_DEFAULT_OUTRO_HEADLINE =
  "🗞️ Up to date bleiben.\n👉 6iBrief abonnieren.";
export const SIXIBRIEF_DEFAULT_OUTRO_CTA = "→ Link in der Bio";

export const INSTRUMENT_SANS_STACK =
  "var(--font-instrument-sans), 'Instrument Sans', 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', system-ui, sans-serif";

export const GT_SECTRA_STACK =
  "var(--font-gt-sectra), 'GT Sectra', 'Iowan Old Style', Palatino, Georgia, 'Apple Color Emoji', 'Segoe UI Emoji', serif";

export const SIXIBRIEF_LOGO_SRC = "/brand/6ibrief-logo-white.png";
export const SIXIBRIEF_LOGO = {
  left: 81,
  top: 99,
  width: 275,
  height: 73,
} as const;
/** Intrinsic PNG size and opaque glyph box (transparent padding around the wordmark). */
export const SIXIBRIEF_LOGO_SOURCE = {
  width: 606,
  height: 250,
  glyph: { left: 63, top: 59, width: 479, height: 128 },
} as const;
