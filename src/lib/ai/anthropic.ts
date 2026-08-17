import Anthropic from "@anthropic-ai/sdk";
import { systemPromptForFormat } from "@/lib/ai/carousel-prompts";
import {
  llmDraftToSlides,
  parseLlmCarouselDraft,
  type LlmCarouselDraft,
} from "@/lib/carousel/from-llm";
import type { CarouselFormat } from "@/lib/carousel/format";
import { enforceSlideTextLimits } from "@/lib/carousel/text-limits";
import type { Slide } from "@/lib/carousel/types";
import type { FetchedArticle } from "@/lib/wepublish/article";

export class AiGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiGenerationError";
  }
}

const TOOL_NAME = "create_carousel_slides";

const baseSlideProperties = {
  type: {
    type: "string" as const,
    enum: ["cover", "text", "quote", "outro"],
  },
  overline: { type: "string" as const },
  headline: { type: "string" as const },
  bodyHtml: { type: "string" as const },
  quoteText: { type: "string" as const },
  attribution: { type: "string" as const },
  ctaText: { type: "string" as const },
};

const standardToolInputSchema = {
  type: "object" as const,
  additionalProperties: false,
  required: ["category", "slides"],
  properties: {
    category: { type: "string" as const },
    slides: {
      type: "array" as const,
      minItems: 6,
      maxItems: 10,
      items: {
        type: "object" as const,
        additionalProperties: false,
        required: ["type"],
        properties: baseSlideProperties,
      },
    },
  },
};

const kolumneToolInputSchema = {
  type: "object" as const,
  additionalProperties: false,
  required: ["category", "slides"],
  properties: {
    category: { type: "string" as const },
    slides: {
      type: "array" as const,
      minItems: 6,
      maxItems: 10,
      items: {
        type: "object" as const,
        additionalProperties: false,
        required: ["type"],
        properties: {
          type: {
            type: "string" as const,
            enum: ["cover", "quote", "outro"],
          },
          overline: { type: "string" as const },
          headline: { type: "string" as const },
          quoteText: { type: "string" as const },
          attribution: { type: "string" as const },
          ctaText: { type: "string" as const },
        },
      },
    },
  },
};

const tsueritippToolInputSchema = {
  type: "object" as const,
  additionalProperties: false,
  required: ["category", "slides"],
  properties: {
    category: { type: "string" as const },
    slides: {
      type: "array" as const,
      minItems: 3,
      maxItems: 30,
      items: {
        type: "object" as const,
        additionalProperties: false,
        required: ["type"],
        properties: {
          type: {
            type: "string" as const,
            enum: ["cover", "text", "outro"],
          },
          overline: { type: "string" as const },
          headline: { type: "string" as const },
          bodyHtml: { type: "string" as const },
          ctaText: { type: "string" as const },
        },
      },
    },
  },
};

function getModel(): string {
  return process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-5";
}

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw new AiGenerationError(
      "ANTHROPIC_API_KEY fehlt. Bitte in der Umgebung setzen.",
    );
  }
  return new Anthropic({ apiKey });
}

function titleFromPastedText(text: string): string {
  const first =
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) ?? "";
  const cleaned = first.replace(/^#+\s*/, "").replace(/^["«»„“]+|["«»„“]+$/g, "");
  if (!cleaned) return "6iBrief";
  return cleaned.length > 200 ? `${cleaned.slice(0, 197)}…` : cleaned;
}

function pastedTextToArticle(
  text: string,
  format: CarouselFormat,
): FetchedArticle {
  return {
    id: "paste",
    slug: "paste",
    url: null,
    title: titleFromPastedText(text),
    preTitle: format === "6ibrief" ? "6iBRIEF" : null,
    lead: null,
    authors: [],
    tags: [],
    imageUrl: null,
    bodyText: text,
  };
}

function articleToPrompt(
  article: FetchedArticle,
  format: CarouselFormat,
  source: "article" | "paste",
): string {
  const maxChars = 14_000;
  const body =
    article.bodyText.length > maxChars
      ? `${article.bodyText.slice(0, maxChars)}\n…[gekürzt]`
      : article.bodyText;

  const leadLine =
    source === "paste"
      ? null
      : format === "interview"
        ? article.lead
          ? `Lead (für Interview verwenden): ${article.lead}`
          : null
        : article.lead
          ? `Lead: ${article.lead}`
          : null;

  const bodyLabel =
    source === "paste"
      ? "Eingefügter Text:"
      : format === "tsueritipp"
        ? "Artikeltext (Termine im Tsüritipp-Format):"
        : "Artikeltext (Fliesstext, ohne Lead):";

  return [
    `EINGABE-PARAMETER format: ${format}`,
    `Titel: ${article.title}`,
    article.preTitle ? `PreTitle: ${article.preTitle}` : null,
    leadLine,
    article.authors.length ? `Autor:innen: ${article.authors.join(", ")}` : null,
    article.tags.length ? `Tags: ${article.tags.join(", ")}` : null,
    article.url ? `URL: ${article.url}` : null,
    "",
    bodyLabel,
    body,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

async function generateSlidesFromSource(
  article: FetchedArticle,
  format: CarouselFormat,
  source: "article" | "paste",
): Promise<Slide[]> {
  let system: string;
  try {
    system = systemPromptForFormat(format);
  } catch (error) {
    throw new AiGenerationError(
      error instanceof Error ? error.message : "Unbekanntes Carousel-Format.",
    );
  }

  const client = getClient();
  const toolInputSchema =
    format === "tsueritipp" || format === "6ibrief"
      ? tsueritippToolInputSchema
      : format === "kolumne"
        ? kolumneToolInputSchema
        : standardToolInputSchema;
  const maxTokens = format === "tsueritipp" ? 8192 : 4096;
  const intro =
    source === "paste"
      ? "Erstelle ein Instagram-Carousel aus diesem eingefügten Text:"
      : "Erstelle ein Instagram-Carousel aus diesem Tsüri-Artikel:";

  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model: getModel(),
      max_tokens: maxTokens,
      system,
      tools: [
        {
          name: TOOL_NAME,
          description:
            "Erzeugt strukturierte Instagram-Carousel-Slides aus dem Artikel.",
          input_schema: toolInputSchema,
        },
      ],
      tool_choice: { type: "tool", name: TOOL_NAME },
      messages: [
        {
          role: "user",
          content: `${intro}\n\n${articleToPrompt(article, format, source)}`,
        },
      ],
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unbekannter Anthropic-Fehler";
    throw new AiGenerationError(`LLM-Aufruf fehlgeschlagen: ${message}`);
  }

  const toolBlock = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
  );
  if (!toolBlock) {
    throw new AiGenerationError("LLM hat keine strukturierten Slides geliefert.");
  }

  let draft: LlmCarouselDraft;
  try {
    draft = parseLlmCarouselDraft(toolBlock.input, format);
  } catch {
    throw new AiGenerationError(
      "LLM-Antwort ist ungültig (Schema-Prüfung fehlgeschlagen).",
    );
  }

  try {
    return enforceSlideTextLimits(
      llmDraftToSlides(draft, { coverImageUrl: article.imageUrl, format }),
      format,
    );
  } catch (error) {
    throw new AiGenerationError(
      error instanceof Error ? error.message : "Slide-Mapping fehlgeschlagen.",
    );
  }
}

export async function generateSlidesFromArticle(
  article: FetchedArticle,
  format: CarouselFormat = "standard",
): Promise<Slide[]> {
  return generateSlidesFromSource(article, format, "article");
}

export async function generateSlidesFromPastedText(
  text: string,
  format: CarouselFormat = "standard",
): Promise<{ slides: Slide[]; title: string }> {
  const article = pastedTextToArticle(text.trim(), format);
  const slides = await generateSlidesFromSource(article, format, "paste");
  return { slides, title: article.title };
}
