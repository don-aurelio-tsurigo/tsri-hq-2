import {
  backgroundColorForCategory,
  defaultInkForCategory,
  DEFAULT_CATEGORY,
  type SlideInk,
} from "@/lib/carousel/categories";
import {
  DEFAULT_OUTRO_CTA,
  type CoverSlide,
  type OutroSlide,
  type QuoteSlide,
  type Slide,
  type SlideType,
  type TextSlide,
} from "@/lib/carousel/types";

function newId() {
  return globalThis.crypto.randomUUID();
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

export function createEmptySlide(
  type: SlideType,
  category: string = DEFAULT_CATEGORY,
): Slide {
  switch (type) {
    case "cover":
      return createEmptyCoverSlide(category);
    case "text":
      return createEmptyTextSlide(category);
    case "quote":
      return createEmptyQuoteSlide(category);
    case "outro":
      return createEmptyOutroSlide(category);
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
