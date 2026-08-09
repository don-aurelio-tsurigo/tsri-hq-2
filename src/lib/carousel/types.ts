export const DEFAULT_CATEGORY = "STADTLEBEN";
/** Tsüri Instagram gold/ochre from production slide examples */
export const DEFAULT_BG = "#b9935e";
export const DEFAULT_OUTRO_CTA = "LINK IN DER BIO";
export const BRAND_MARK = "TSÜRI";
export const BRAND_LOGO_SRC = "/brand/tsuri-logo.png";

export const CANVAS_WIDTH = 1080;
export const CANVAS_HEIGHT = 1350;

/** Offset/scale relative to the template default placement */
export type LayerTransform = {
  x: number;
  y: number;
  scale: number;
};

export const DEFAULT_TRANSFORM: LayerTransform = {
  x: 0,
  y: 0,
  scale: 1,
};

export type SlideBase = {
  id: string;
  category: string;
};

export type CoverSlide = SlideBase & {
  type: "cover";
  backgroundImageUrl: string | null;
  overline: string;
  headline: string;
  imageTransform?: LayerTransform;
  textTransform?: LayerTransform;
};

export type TextSlide = SlideBase & {
  type: "text";
  backgroundImageUrl: string | null;
  backgroundColor: string;
  bodyHtml: string;
  imageTransform?: LayerTransform;
  textTransform?: LayerTransform;
};

export type QuoteSlide = SlideBase & {
  type: "quote";
  backgroundImageUrl: string | null;
  backgroundColor: string;
  quoteText: string;
  attribution: string;
  imageTransform?: LayerTransform;
  textTransform?: LayerTransform;
};

export type OutroSlide = SlideBase & {
  type: "outro";
  backgroundColor: string;
  headline: string;
  ctaText: string;
  textTransform?: LayerTransform;
};

export type Slide = CoverSlide | TextSlide | QuoteSlide | OutroSlide;
export type SlideType = Slide["type"];
export type EditableLayer = "image" | "text";
