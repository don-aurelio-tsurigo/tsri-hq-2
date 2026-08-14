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
            enum: ["cover", "tipp-item", "outro"],
          },
          overline: { type: "string" as const },
          headline: { type: "string" as const },
          ctaText: { type: "string" as const },
          items: {
            type: "array" as const,
            minItems: 1,
            maxItems: 2,
            items: {
              type: "object" as const,
              additionalProperties: false,
              required: ["title", "body", "meta"],
              properties: {
                title: { type: "string" as const },
                body: { type: "string" as const },
                meta: { type: "string" as const },
              },
            },
          },
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

function articleToPrompt(
  article: FetchedArticle,
  format: CarouselFormat,
): string {
  const maxChars = 14_000;
  const body =
    article.bodyText.length > maxChars
      ? `${article.bodyText.slice(0, maxChars)}\n…[gekürzt]`
      : article.bodyText;

  const leadLine =
    format === "interview"
      ? article.lead
        ? `Lead (für Interview verwenden): ${article.lead}`
        : null
      : article.lead
        ? `Lead: ${article.lead}`
        : null;

  return [
    `EINGABE-PARAMETER format: ${format}`,
    `Titel: ${article.title}`,
    article.preTitle ? `PreTitle: ${article.preTitle}` : null,
    leadLine,
    article.authors.length ? `Autor:innen: ${article.authors.join(", ")}` : null,
    article.tags.length ? `Tags: ${article.tags.join(", ")}` : null,
    article.url ? `URL: ${article.url}` : null,
    "",
    format === "tsueritipp"
      ? "Artikeltext (Termine im Tsüritipp-Format):"
      : "Artikeltext (Fliesstext, ohne Lead):",
    body,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

export async function generateSlidesFromArticle(
  article: FetchedArticle,
  format: CarouselFormat = "standard",
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
    format === "tsueritipp" ? tsueritippToolInputSchema : standardToolInputSchema;
  const maxTokens = format === "tsueritipp" ? 8192 : 4096;

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
          content: `Erstelle ein Instagram-Carousel aus diesem Tsüri-Artikel:\n\n${articleToPrompt(article, format)}`,
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
      llmDraftToSlides(draft, { coverImageUrl: article.imageUrl }),
    );
  } catch (error) {
    throw new AiGenerationError(
      error instanceof Error ? error.message : "Slide-Mapping fehlgeschlagen.",
    );
  }
}
