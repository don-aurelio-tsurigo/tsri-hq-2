export const DEFAULT_CATEGORY = "STADTLEBEN";
/** Tsüri Instagram gold/ochre from production slide examples */
export const DEFAULT_BG = "#b9935e";
export const DEFAULT_OUTRO_CTA = "LINK IN DER BIO";
export const BRAND_MARK = "TSÜRI";

export const CANVAS_WIDTH = 1080;
export const CANVAS_HEIGHT = 1350;

export type SlideBase = {
  id: string;
  category: string;
};

export type CoverSlide = SlideBase & {
  type: "cover";
  backgroundImageUrl: string | null;
  overline: string;
  headline: string;
};

export type TextSlide = SlideBase & {
  type: "text";
  backgroundColor: string;
  bodyHtml: string;
};

export type QuoteSlide = SlideBase & {
  type: "quote";
  backgroundImageUrl: string | null;
  backgroundColor: string;
  quoteText: string;
  attribution: string;
};

export type OutroSlide = SlideBase & {
  type: "outro";
  backgroundColor: string;
  headline: string;
  ctaText: string;
};

export type Slide = CoverSlide | TextSlide | QuoteSlide | OutroSlide;
export type SlideType = Slide["type"];
