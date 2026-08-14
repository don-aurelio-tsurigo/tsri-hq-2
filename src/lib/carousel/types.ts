import type { SlideInk } from "@/lib/carousel/categories";

export {
  DEFAULT_BG,
  DEFAULT_CATEGORY,
  type SlideInk,
} from "@/lib/carousel/categories";

export const DEFAULT_OUTRO_CTA = "LINK IN DER BIO";
export const BRAND_MARK = "TSÜRI";
export const BRAND_LOGO_SRC = "/brand/tsuri-logo.png";
export const TIPP_LOGO_SRC = "/brand/tsuri-tipp-logo.png";
export const TIPP_LOGO_WHITE_SRC = "/brand/tsuri-tipp-logo-white.png";
export const TIPP_LOGO_TEAL_SRC = "/brand/tsuri-tipp-logo-teal.png";
export const TIPP_TEAL = "#00b8b6";

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

/** Default zoom for background photos (fills height; sides may clip). */
export const DEFAULT_IMAGE_TRANSFORM: LayerTransform = {
  x: 0,
  y: 0,
  scale: 1.9,
};

/** Darkening treatment for slides with a background image */
export type ImageOverlay = {
  /** Flat image dim via brightness filter, 0–1 */
  dim: number;
  /** Verlauf Stärke: opacity at the bottom, 0–1 */
  gradientStrength: number;
  /** Verlauf Höhe: how far up the ramp reaches, 0–1 */
  gradientLift: number;
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
  imageOverlay?: ImageOverlay;
};

export type TextSlide = SlideBase & {
  type: "text";
  backgroundImageUrl: string | null;
  backgroundColor: string;
  /** white vs black text; default from category theme */
  ink?: SlideInk;
  bodyHtml: string;
  imageTransform?: LayerTransform;
  textTransform?: LayerTransform;
  imageOverlay?: ImageOverlay;
};

export type QuoteSlide = SlideBase & {
  type: "quote";
  backgroundImageUrl: string | null;
  backgroundColor: string;
  ink?: SlideInk;
  quoteText: string;
  attribution: string;
  imageTransform?: LayerTransform;
  textTransform?: LayerTransform;
  imageOverlay?: ImageOverlay;
};

export type OutroSlide = SlideBase & {
  type: "outro";
  backgroundColor: string;
  ink?: SlideInk;
  headline: string;
  ctaText: string;
  textTransform?: LayerTransform;
};

export type TippEvent = {
  title: string;
  body: string;
  meta: string;
};

/** Tsüritipp weekday item; 1–2 events per slide. */
export type TippItemSlide = SlideBase & {
  type: "tipp-item";
  backgroundColor: string;
  ink?: SlideInk;
  items: TippEvent[];
  textTransform?: LayerTransform;
};

export type Slide =
  | CoverSlide
  | TextSlide
  | QuoteSlide
  | OutroSlide
  | TippItemSlide;
export type SlideType = Slide["type"];
export type EditableLayer = "image" | "text";
