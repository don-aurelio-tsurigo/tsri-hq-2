export const DEFAULT_CATEGORY = "STADTLEBEN";
export const DEFAULT_BG = "#faff72";
export const DEFAULT_OUTRO_CTA = "LINK IN DER BIO";

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
