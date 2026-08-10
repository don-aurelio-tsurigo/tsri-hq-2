import Anthropic from "@anthropic-ai/sdk";
import { categoryColorPromptBlock } from "@/lib/carousel/categories";
import {
  llmCarouselSchema,
  llmDraftToSlides,
  type LlmCarouselDraft,
} from "@/lib/carousel/from-llm";
import type { Slide } from "@/lib/carousel/types";
import type { FetchedArticle } from "@/lib/wepublish/article";

export class AiGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiGenerationError";
  }
}

const TOOL_NAME = "create_carousel_slides";

const SYSTEM_PROMPT = `Du bist Redakteur:in bei Tsüri.ch und erstellst Instagram-Karussells (1080×1350).
Regeln:
- Sprache: Deutsch (Schweiz), klar, knapp, publikumsnah.
- Genau 6–10 Slides insgesamt.
- Erster Slide: type "cover". Letzter Slide: type "outro".
- Dazwischen vor allem "text", optional "quote" wenn ein echtes Zitat passt.
- Ändere den Text keinesfalls in der Aussage.
${categoryColorPromptBlock()}
- Setze "category" auf genau einen Namen aus der Liste (GROSSBUCHSTABEN); Farbe und Textkontrast folgen daraus automatisiert.
- Cover: überline aus Pre-Title übernehmen, headline: Artikel-Titel verwenden (darf Zeilenumbrüche als \\n enthalten).
- Text-Slides: bodyHtml max. 500 Zeichen, nur <b>, <i> und Zeilenumbrüche (\\n oder <br/>), keine anderen Tags.
- Quote: quoteText ohne führende Anführungszeichen; attribution mit Name.
- Outro: Titel + ctaText  "LINK IN DER BIO".
- Keine erfundenen Fakten; Ziel ist es den Text aufzuteilen und bei Bedarf zu kürzen. Dichte nichts dazu.
- Fülle create_carousel_slides genau einmal.`;


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

const toolInputSchema = {
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
            enum: ["cover", "text", "quote", "outro"],
          },
          overline: { type: "string" as const },
          headline: { type: "string" as const },
          bodyHtml: { type: "string" as const },
          quoteText: { type: "string" as const },
          attribution: { type: "string" as const },
          ctaText: { type: "string" as const },
        },
      },
    },
  },
};

function articleToPrompt(article: FetchedArticle): string {
  const maxChars = 14_000;
  const body =
    article.bodyText.length > maxChars
      ? `${article.bodyText.slice(0, maxChars)}\n…[gekürzt]`
      : article.bodyText;

  return [
    `Titel: ${article.title}`,
    article.preTitle ? `PreTitle: ${article.preTitle}` : null,
    article.lead ? `Lead: ${article.lead}` : null,
    article.authors.length ? `Autor:innen: ${article.authors.join(", ")}` : null,
    article.tags.length ? `Tags: ${article.tags.join(", ")}` : null,
    article.url ? `URL: ${article.url}` : null,
    "",
    "Artikeltext:",
    body,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

export async function generateSlidesFromArticle(
  article: FetchedArticle,
): Promise<Slide[]> {
  const client = getClient();

  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model: getModel(),
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
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
          content: `Erstelle ein Instagram-Carousel aus diesem Tsüri-Artikel:\n\n${articleToPrompt(article)}`,
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
    draft = llmCarouselSchema.parse(toolBlock.input);
  } catch {
    throw new AiGenerationError(
      "LLM-Antwort ist ungültig (Schema-Prüfung fehlgeschlagen).",
    );
  }

  try {
    return llmDraftToSlides(draft, { coverImageUrl: article.imageUrl });
  } catch (error) {
    throw new AiGenerationError(
      error instanceof Error ? error.message : "Slide-Mapping fehlgeschlagen.",
    );
  }
}
