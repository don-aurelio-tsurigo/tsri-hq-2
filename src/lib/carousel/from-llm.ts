import { z } from "zod";
import {
  backgroundColorForCategory,
  defaultInkForCategory,
  normalizeCarouselCategory,
  DEFAULT_CATEGORY,
} from "@/lib/carousel/categories";
import {
  createEmptyCoverSlide,
  createEmptyOutroSlide,
  createEmptyQuoteSlide,
  createEmptyTextSlide,
} from "@/lib/carousel/slides";
import { DEFAULT_OUTRO_CTA, type Slide } from "@/lib/carousel/types";

const coverDraft = z.object({
  type: z.literal("cover"),
  overline: z.string().default(""),
  headline: z.string().min(1),
});

const textDraft = z.object({
  type: z.literal("text"),
  bodyHtml: z.string().min(1),
});

const quoteDraft = z.object({
  type: z.literal("quote"),
  quoteText: z.string().min(1),
  attribution: z.string().default(""),
});

const outroDraft = z.object({
  type: z.literal("outro"),
  headline: z.string().min(1),
  ctaText: z.string().optional(),
});

export const llmCarouselSchema = z.object({
  category: z.string().min(1).default(DEFAULT_CATEGORY),
  slides: z
    .array(z.discriminatedUnion("type", [coverDraft, textDraft, quoteDraft, outroDraft]))
    .min(6)
    .max(10),
});

export type LlmCarouselDraft = z.infer<typeof llmCarouselSchema>;

export function llmDraftToSlides(
  draft: LlmCarouselDraft,
  options?: { coverImageUrl?: string | null },
): Slide[] {
  const category = normalizeCarouselCategory(draft.category);
  const backgroundColor = backgroundColorForCategory(category);
  const ink = defaultInkForCategory(category);
  const slides = draft.slides;

  if (slides[0]?.type !== "cover") {
    throw new Error("LLM-Antwort: Erster Slide muss Cover sein.");
  }
  if (slides[slides.length - 1]?.type !== "outro") {
    throw new Error("LLM-Antwort: Letzter Slide muss Outro sein.");
  }

  const coverImageUrl = options?.coverImageUrl?.trim() || null;

  return slides.map((slide, index) => {
    switch (slide.type) {
      case "cover": {
        const cover = createEmptyCoverSlide(category);
        return {
          ...cover,
          overline: slide.overline.trim(),
          headline: slide.headline.trim(),
          backgroundImageUrl: index === 0 ? coverImageUrl : null,
        };
      }
      case "text": {
        const text = createEmptyTextSlide(category);
        return {
          ...text,
          backgroundColor,
          ink,
          bodyHtml: sanitizeBodyHtml(slide.bodyHtml).slice(0, 800),
        };
      }
      case "quote": {
        const quote = createEmptyQuoteSlide(category);
        return {
          ...quote,
          backgroundColor,
          ink,
          quoteText: slide.quoteText.trim(),
          attribution: slide.attribution.trim(),
        };
      }
      case "outro": {
        const outro = createEmptyOutroSlide(category);
        return {
          ...outro,
          backgroundColor,
          ink,
          headline: slide.headline.trim(),
          ctaText: (slide.ctaText?.trim() || DEFAULT_OUTRO_CTA).toUpperCase(),
        };
      }
    }
  });
}

function sanitizeBodyHtml(input: string): string {
  const escaped = input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped
    .replace(/&lt;b&gt;/gi, "<b>")
    .replace(/&lt;\/b&gt;/gi, "</b>")
    .replace(/&lt;i&gt;/gi, "<i>")
    .replace(/&lt;\/i&gt;/gi, "</i>")
    .replace(/&lt;br\s*\/?&gt;/gi, "<br/>")
    .replace(/\n/g, "<br/>")
    .trim();
}
