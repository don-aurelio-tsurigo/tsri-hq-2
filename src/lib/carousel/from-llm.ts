import { z } from "zod";
import { normalizeQuoteMarks } from "@/lib/carousel/quotes";
import {
  backgroundColorForCategory,
  defaultInkForCategory,
  normalizeCarouselCategory,
  DEFAULT_CATEGORY,
} from "@/lib/carousel/categories";
import type { CarouselFormat } from "@/lib/carousel/format";
import { isQuoteCascadeFormat } from "@/lib/carousel/format";
import {
  createEmptyCoverSlide,
  createEmptyOutroSlide,
  createEmptyQuoteSlide,
  createEmptyTextSlide,
  applyFormatSlideDefaults,
} from "@/lib/carousel/slides";
import {
  decodeHtmlEntities,
  sanitizeSlideHtml,
  separateTsueritippEvents,
} from "@/lib/carousel/html";
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
    .array(
      z.discriminatedUnion("type", [coverDraft, textDraft, quoteDraft, outroDraft]),
    )
    .min(6)
    .max(10),
});

export const llmKolumneSchema = z.object({
  category: z.string().min(1).default(DEFAULT_CATEGORY),
  slides: z
    .array(z.discriminatedUnion("type", [coverDraft, quoteDraft, outroDraft]))
    .min(6)
    .max(10),
});

export const llmTsueritippSchema = z.object({
  category: z.string().min(1).default(DEFAULT_CATEGORY),
  slides: z
    .array(z.discriminatedUnion("type", [coverDraft, textDraft, outroDraft]))
    .min(3)
    .max(10),
});

export const llmSixibriefSchema = z.object({
  category: z.string().min(1).default(DEFAULT_CATEGORY),
  slides: z
    .array(z.discriminatedUnion("type", [coverDraft, textDraft, outroDraft]))
    .min(3)
    .max(30),
});

export type LlmCarouselDraft =
  | z.infer<typeof llmCarouselSchema>
  | z.infer<typeof llmKolumneSchema>
  | z.infer<typeof llmTsueritippSchema>
  | z.infer<typeof llmSixibriefSchema>;

function maxSlidesForFormat(format: CarouselFormat): number {
  return format === "6ibrief" ? 30 : 10;
}

/** The model sometimes overshoots the slide limit on long articles; keep the outro and drop the overflow before it. */
function trimExcessSlides(input: unknown, max: number): unknown {
  if (!input || typeof input !== "object") return input;
  const slides = (input as { slides?: unknown }).slides;
  if (!Array.isArray(slides) || slides.length <= max) return input;
  return {
    ...input,
    slides: [...slides.slice(0, max - 1), slides[slides.length - 1]],
  };
}

export function parseLlmCarouselDraft(
  rawInput: unknown,
  format: CarouselFormat,
): LlmCarouselDraft {
  const input = trimExcessSlides(rawInput, maxSlidesForFormat(format));
  if (format === "tsueritipp") {
    return llmTsueritippSchema.parse(input);
  }
  if (format === "6ibrief") {
    return llmSixibriefSchema.parse(input);
  }
  if (isQuoteCascadeFormat(format)) {
    return llmKolumneSchema.parse(input);
  }
  return llmCarouselSchema.parse(input);
}

export function llmDraftToSlides(
  draft: LlmCarouselDraft,
  options?: { coverImageUrl?: string | null; format?: CarouselFormat },
): Slide[] {
  const category = normalizeCarouselCategory(draft.category);
  const backgroundColor = backgroundColorForCategory(category);
  const ink = defaultInkForCategory(category);
  const slides = draft.slides;
  const format = options?.format ?? "standard";

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
        return applyFormatSlideDefaults(
          {
            ...cover,
            overline: decodeHtmlEntities(slide.overline.trim()),
            headline: decodeHtmlEntities(slide.headline.trim()),
            backgroundImageUrl: index === 0 ? coverImageUrl : null,
          },
          format,
        );
      }
      case "text": {
        const text = createEmptyTextSlide(category);
        return applyFormatSlideDefaults(
          {
            ...text,
            backgroundColor,
            ink,
            bodyHtml:
              format === "tsueritipp"
                ? separateTsueritippEvents(sanitizeSlideHtml(slide.bodyHtml))
                : sanitizeSlideHtml(slide.bodyHtml),
          },
          format,
        );
      }
      case "quote": {
        const quote = createEmptyQuoteSlide(category);
        return applyFormatSlideDefaults(
          {
            ...quote,
            backgroundColor,
            ink,
            quoteText: normalizeQuoteMarks(
              sanitizeSlideHtml(slide.quoteText.trim()),
            ),
            attribution: decodeHtmlEntities(slide.attribution.trim()),
          },
          format,
        );
      }
      case "outro": {
        const outro = createEmptyOutroSlide(category);
        const ctaRaw = slide.ctaText?.trim() || DEFAULT_OUTRO_CTA;
        return applyFormatSlideDefaults(
          {
            ...outro,
            backgroundColor,
            ink,
            headline: decodeHtmlEntities(slide.headline.trim()),
            ctaText: decodeHtmlEntities(
              format === "6ibrief" ? ctaRaw : ctaRaw.toUpperCase(),
            ),
          },
          format,
        );
      }
    }
  });
}
