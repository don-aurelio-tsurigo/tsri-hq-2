import {
  backgroundColorForCategory,
  defaultInkForCategory,
  DEFAULT_CATEGORY,
  type SlideInk,
} from "@/lib/carousel/categories";
import type { CarouselFormat } from "@/lib/carousel/format";
import { defaultImageOverlayForSlideType } from "@/lib/carousel/overlay";
import {
  SIXIBRIEF_BG,
  SIXIBRIEF_DEFAULT_OUTRO_CTA,
  SIXIBRIEF_DEFAULT_OUTRO_HEADLINE,
  SIXIBRIEF_DEFAULT_OVERLINE,
  SIXIBRIEF_INK,
} from "@/lib/carousel/sixibrief";
import {
  DEFAULT_OUTRO_CTA,
  type CoverSlide,
  type OutroSlide,
  type QuoteSlide,
  type Slide,
  type SlideType,
  type TextSlide,
  type TippItemSlide,
} from "@/lib/carousel/types";

function newId() {
  return globalThis.crypto.randomUUID();
}

export function defaultCategoryForFormat(format: CarouselFormat): string {
  return format === "tsueritipp" ? "TIPP" : DEFAULT_CATEGORY;
}

export function createEmptyCoverSlide(
  category: string = DEFAULT_CATEGORY,
): CoverSlide {
  return {
    id: newId(),
    type: "cover",
    category,
    backgroundImageUrl: null,
    overline: "",
    headline: "",
    imageOverlay: defaultImageOverlayForSlideType("cover"),
  };
}

export function createEmptyTextSlide(
  category: string = DEFAULT_CATEGORY,
): TextSlide {
  return {
    id: newId(),
    type: "text",
    category,
    backgroundImageUrl: null,
    backgroundColor: backgroundColorForCategory(category),
    ink: defaultInkForCategory(category),
    bodyHtml: "",
    imageOverlay: defaultImageOverlayForSlideType("text"),
  };
}

export function createEmptyQuoteSlide(
  category: string = DEFAULT_CATEGORY,
): QuoteSlide {
  return {
    id: newId(),
    type: "quote",
    category,
    backgroundImageUrl: null,
    backgroundColor: backgroundColorForCategory(category),
    ink: defaultInkForCategory(category),
    quoteText: "",
    attribution: "",
    imageOverlay: defaultImageOverlayForSlideType("quote"),
  };
}

export function createEmptyOutroSlide(
  category: string = DEFAULT_CATEGORY,
): OutroSlide {
  return {
    id: newId(),
    type: "outro",
    category,
    backgroundColor: backgroundColorForCategory(category),
    ink: defaultInkForCategory(category),
    headline: "",
    ctaText: DEFAULT_OUTRO_CTA,
  };
}

export function createEmptyTippItemSlide(
  category: string = DEFAULT_CATEGORY,
): TippItemSlide {
  return {
    id: newId(),
    type: "tipp-item",
    category,
    backgroundColor: backgroundColorForCategory(category),
    ink: defaultInkForCategory(category),
    items: [{ title: "", body: "", meta: "" }],
  };
}

export function createEmptySlide(
  type: SlideType,
  category: string = DEFAULT_CATEGORY,
  format: CarouselFormat = "standard",
): Slide {
  let slide: Slide;
  switch (type) {
    case "cover":
      slide = createEmptyCoverSlide(category);
      break;
    case "text":
      slide = createEmptyTextSlide(category);
      break;
    case "quote":
      slide = createEmptyQuoteSlide(category);
      break;
    case "outro":
      slide = createEmptyOutroSlide(category);
      break;
    case "tipp-item":
      slide = createEmptyTippItemSlide(category);
      break;
  }
  return applyFormatSlideDefaults(slide, format);
}

export function applyFormatSlideDefaults(
  slide: Slide,
  format: CarouselFormat,
): Slide {
  if (format !== "6ibrief") return slide;
  switch (slide.type) {
    case "cover":
      return {
        ...slide,
        overline: slide.overline.trim() || SIXIBRIEF_DEFAULT_OVERLINE,
      };
    case "text":
    case "quote":
      return {
        ...slide,
        backgroundColor: SIXIBRIEF_BG,
        ink: SIXIBRIEF_INK,
      };
    case "outro":
      return {
        ...slide,
        backgroundColor: SIXIBRIEF_BG,
        ink: SIXIBRIEF_INK,
        headline: SIXIBRIEF_DEFAULT_OUTRO_HEADLINE,
        ctaText: SIXIBRIEF_DEFAULT_OUTRO_CTA,
      };
    default:
      return slide;
  }
}

export function lastCategory(slides: Slide[]): string {
  const last = slides[slides.length - 1];
  return last?.category?.trim() || DEFAULT_CATEGORY;
}

export function themeFieldsForCategory(category: string): {
  backgroundColor: string;
  ink: SlideInk;
} {
  return {
    backgroundColor: backgroundColorForCategory(category),
    ink: defaultInkForCategory(category),
  };
}
