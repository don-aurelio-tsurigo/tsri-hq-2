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
- Sprache: Deutsch (Schweiz), Originalwortlaut des Artikels beibehalten.
- Genau 6–10 Slides insgesamt.
- Erster Slide: type "cover". Letzter Slide: type "outro".
- Dazwischen vor allem "text", optional "quote" wenn ein echtes Zitat passt.

WICHTIGSTE REGEL — Textmenge:
- Ziel ist es, so viel wie möglich vom Original-Artikeltext auf die Slides zu bringen, idealerweise praktisch den gesamten Fliesstext (ohne Lead).
- Verwende den Artikeltext wortwörtlich. Nicht umformulieren, nicht zusammenfassen, nicht paraphrasieren.
- Kürzen ist nur erlaubt, wenn ein Abschnitt sonst nicht auf die Slides passen würde (max. 500 Zeichen pro Text-Slide) — und auch dann nur durch Weglassen von Sätzen/Nebensätzen, nie durch Umschreiben der verbleibenden Sätze.
- Nutze so viele Text-Slides wie nötig (innerhalb der 6–10 Slide-Grenze), um möglichst viel Original-Text unterzubringen, statt früh zusammenzufassen.
- Den Artikel-Lead (Teaser/Intro-Absatz vor dem Fliesstext) NICHT verwenden — nur der eigentliche Artikeltext ab dem ersten Fliesstext-Absatz zählt.
- Ändere den Text keinesfalls in der Aussage.

${categoryColorPromptBlock()}
- Setze "category" auf genau einen Namen aus der Liste (GROSSBUCHSTABEN); Farbe und Textkontrast folgen daraus automatisiert.

- Cover: overline aus Pre-Title übernehmen, headline: Artikel-Titel wortwörtlich verwenden (darf Zeilenumbrüche als \\n enthalten).
- Text-Slides: bodyHtml max. 500 Zeichen, nur <b>, <i> und Zeilenumbrüche (\\n oder <br/>), keine anderen Tags. Text = Original-Wortlaut, nur bei Bedarf gekürzt (siehe oben).
- Quote: quoteText ohne führende Anführungszeichen; darf gekürzt werden, falls das Zitat sonst nicht auf den Slide passt (Kürzung durch Weglassen, nicht Umschreiben); attribution mit Name.
- Outro: Titel + ctaText "LINK IN DER BIO".
- Keine erfundenen Fakten, keine Umformulierungen, keine Zusammenfassungen. Ziel ist Textübernahme, nicht Textverdichtung.
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
    article.authors.length ? `Autor:innen: ${article.authors.join(", ")}` : null,
    article.tags.length ? `Tags: ${article.tags.join(", ")}` : null,
    article.url ? `URL: ${article.url}` : null,
    "",
    "Artikeltext (Fliesstext, ohne Lead):",
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
