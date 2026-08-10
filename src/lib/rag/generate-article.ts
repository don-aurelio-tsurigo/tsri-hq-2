import { readFileSync } from "node:fs";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { AiGenerationError } from "@/lib/ai/anthropic";
import { embedQuery } from "@/lib/rag/embed-query";
import {
  formatKurzmeldungForCopy,
  kurzmeldungDraftSchema,
  type KurzmeldungDraft,
} from "@/lib/rag/kurzmeldung-shared";
import { searchRagChunks, type RagSearchHit } from "@/lib/rag/search";

export type { KurzmeldungDraft };
export { formatKurzmeldungForCopy };

const TOOL_NAME = "create_kurzmeldung";
const STYLEGUIDE_PATH = join(
  process.cwd(),
  "src/lib/rag/kurzmeldung-styleguide.md",
);

export type GenerateKurzmeldungInput = {
  title: string;
  /** Gespeicherter Teaser/Volltext aus dem Feed */
  summary: string | null;
  /** Expliziter Quelltext (Paste oder nachgeladener Volltext) — hat Vorrang */
  sourceText?: string | null;
  sourceLabel: string;
  link: string;
};

export type GenerateKurzmeldungResult = {
  draft: KurzmeldungDraft;
  ragHitCount: number;
  ragWarning: string | null;
};

let cachedStyleGuide: string | null = null;

function loadStyleGuide(): string {
  if (cachedStyleGuide) return cachedStyleGuide;
  try {
    cachedStyleGuide = readFileSync(STYLEGUIDE_PATH, "utf8");
  } catch {
    throw new AiGenerationError(
      "Style Guide nicht gefunden (src/lib/rag/kurzmeldung-styleguide.md).",
    );
  }
  return cachedStyleGuide;
}

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

function formatRagContext(hits: RagSearchHit[]): string {
  if (hits.length === 0) {
    return "(keine RAG-Treffer)";
  }
  return hits
    .map((hit, i) => {
      const authors =
        hit.authors.length > 0 ? hit.authors.join(", ") : "unbekannt";
      return [
        `### RAG-Treffer ${i + 1}`,
        `Titel: ${hit.title ?? "(ohne Titel)"}`,
        `URL: ${hit.url ?? "—"}`,
        `Datum: ${hit.publishedAt ?? "—"}`,
        `Autor:innen: ${authors}`,
        `Ausschnitt: ${hit.chunkText}`,
      ].join("\n");
    })
    .join("\n\n");
}

async function fetchRagContext(query: string): Promise<{
  hits: RagSearchHit[];
  warning: string | null;
}> {
  try {
    const embedding = await embedQuery(query);
    const hits = await searchRagChunks({
      queryEmbedding: embedding,
      limit: 5,
      recencyWeight: 0.015,
    });
    return { hits, warning: null };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "RAG-Suche fehlgeschlagen.";
    return {
      hits: [],
      warning: `RAG-Kontext nicht verfügbar (${message}). Entwurf nur aus dem Feed-Item.`,
    };
  }
}

const toolInputSchema = {
  type: "object" as const,
  additionalProperties: false,
  required: ["title", "lead", "body", "sourceUrl"],
  properties: {
    title: { type: "string" as const },
    lead: { type: "string" as const },
    imageCaption: {
      type: "string" as const,
      description: "Optionale Bildlegende; leerer String wenn keines nötig.",
    },
    body: {
      type: "string" as const,
      description:
        "Markdown-Fliesstext inkl. Zwischentitel/Links/Zitaten, endet mit (xx). OHNE Newsletter-Baustein und OHNE separate «Quelle:»-Zeile.",
    },
    sourceUrl: {
      type: "string" as const,
      description:
        "Nur Metadatum: URL der Original-Medienmitteilung/des Fremdartikels. Nicht als separate «Quelle:»-Zeile in title/lead/body ausgeben.",
    },
  },
};

function buildSystemPrompt(styleGuide: string, ragHitCount: number): string {
  const ragRule =
    ragHitCount > 0
      ? `- Es liegen ${ragHitCount} RAG-Treffer aus dem Tsüri-Archiv vor. Mindestens EIN Satz MUSS auf frühere Berichterstattung Bezug nehmen (Zielumfang 300–400 Wörter), z.B. «Bereits im [Jahr] berichtete Tsüri über ähnliche Vorfälle…», mit Markdown-Link auf den gefundenen Artikel (Titel als Linktext, URL aus dem RAG-Treffer). Nur thematisch passende Treffer verwenden; wenn keiner passt, den am nächsten liegenden ehrlich als verwandten Kontext nennen, aber nicht erfinden.`
      : `- Keine RAG-Treffer: keinen erfundenen Archiv-Bezug einbauen.`;

  return `Du bist Redakteur:in bei Tsüri.ch und schreibst kurze, quellenbasierte Kurzmeldungen.

Halte dich strikt an den folgenden Style Guide:

<<<STYLE_GUIDE>
${styleGuide}
</STYLE_GUIDE>>>

Zusätzliche harte Regeln:
- Nur Fakten und Zitate verwenden, die im Quellmaterial oder im RAG-Kontext stehen. Nichts erfinden.
${ragRule}
- Enthält die Originalquelle direkte wörtliche Zitate, MÜSSEN diese als Guillemet-Zitat («…») mit Attribution übernommen werden — nicht nur paraphrasieren.
- Die Originalquelle (Medienmitteilung/Fremdartikel) MUSS inline im Body als Markdown-Link mit «Guillemets» zitiert werden (z.B. «[Tages-Anzeiger](URL)»). Keine separate «Quelle:»-Zeile am Ende des Bodys.
- sourceUrl im Tool ist nur Metadatum (die Original-URL), nicht Teil des sichtbaren Fliesstexts.
- Body ohne Newsletter-Textbaustein / CTA.
- Am Ende des Bodys IMMER den Autor:innen-Kürzel-Platzhalter «(xx)» anhängen (auch wenn die Quelle «(red)» o.ä. nutzt — bei uns konsistent «(xx)»).
- Antwort ausschliesslich über das Tool ${TOOL_NAME}.`;
}

function buildUserPrompt(
  input: GenerateKurzmeldungInput,
  ragHits: RagSearchHit[],
): string {
  const ragSection =
    ragHits.length > 0
      ? [
          `## Archiv-Kontext aus RAG (${ragHits.length} Treffer)`,
          "Pflicht: mindestens einen Satz mit Bezug + Markdown-Link auf einen dieser Artikel einbauen, sofern thematisch vertretbar.",
          formatRagContext(ragHits),
        ]
      : [
          "## Archiv-Kontext aus RAG",
          "(keine Treffer — keinen Archiv-Bezug erfinden)",
        ];

  return [
    "Erstelle eine Tsüri-Kurzmeldung als strukturierten Entwurf.",
    "",
    "## Original-Quellmaterial (Feed-Item)",
    `Titel: ${input.title}`,
    `Quelle: «${input.sourceLabel}»`,
    `URL: ${input.link}`,
    input.sourceText?.trim()
      ? `Volltext der Quelle:\n${input.sourceText.trim()}`
      : input.summary?.trim()
        ? `Zusammenfassung/Text:\n${input.summary.trim()}`
        : "Zusammenfassung: (leer — nur Titel/URL verfügbar)",
    "",
    ...ragSection,
  ].join("\n");
}

/** Ensure body ends with editorial initials placeholder (xx). */
export function ensureAuthorInitialsPlaceholder(body: string): string {
  const trimmed = body.trimEnd();
  if (/\(xx\)\s*$/i.test(trimmed)) return trimmed;
  // Replace a trailing (red)/(xy)/etc. with (xx) for consistency
  if (/\([a-zäöü]{1,4}\)\s*$/i.test(trimmed)) {
    return trimmed.replace(/\([a-zäöü]{1,4}\)\s*$/i, "(xx)");
  }
  return `${trimmed}\n\n(xx)`;
}

export async function generateKurzmeldungFromFeedItem(
  input: GenerateKurzmeldungInput,
): Promise<GenerateKurzmeldungResult> {
  const title = input.title.trim();
  const link = input.link.trim();
  if (!title) {
    throw new AiGenerationError("Feed-Item ohne Titel — Generierung nicht möglich.");
  }
  if (!link) {
    throw new AiGenerationError("Feed-Item ohne URL — Generierung nicht möglich.");
  }
  const sourceText = (input.sourceText ?? input.summary)?.trim() ?? "";
  if (sourceText.length < 120) {
    throw new AiGenerationError(
      "Quelltext zu kurz. Bitte den vollständigen Artikeltext einfügen (oder Stadt-Medienmitteilung neu laden).",
    );
  }

  const styleGuide = loadStyleGuide();
  const { hits, warning } = await fetchRagContext(title);
  const client = getClient();

  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model: getModel(),
      max_tokens: 4096,
      system: buildSystemPrompt(styleGuide, hits.length),
      tools: [
        {
          name: TOOL_NAME,
          description:
            "Erzeugt eine strukturierte Tsüri-Kurzmeldung aus Quellmaterial + optionalem RAG-Kontext.",
          input_schema: toolInputSchema,
        },
      ],
      tool_choice: { type: "tool", name: TOOL_NAME },
      messages: [
        {
          role: "user",
          content: buildUserPrompt(
            {
              ...input,
              title,
              link,
              summary: input.summary,
              sourceText,
            },
            hits,
          ),
        },
      ],
    });
  } catch {
    throw new AiGenerationError(
      "Artikel-Generierung fehlgeschlagen (Claude-API).",
    );
  }

  const toolBlock = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
  );
  if (!toolBlock) {
    throw new AiGenerationError("Claude hat keinen strukturierten Entwurf geliefert.");
  }

  let draft: KurzmeldungDraft;
  try {
    draft = kurzmeldungDraftSchema.parse(toolBlock.input);
  } catch {
    throw new AiGenerationError(
      "Claude-Antwort ist ungültig (Schema-Prüfung fehlgeschlagen).",
    );
  }

  return {
    draft: {
      ...draft,
      body: ensureAuthorInitialsPlaceholder(draft.body),
      imageCaption: draft.imageCaption?.trim() ? draft.imageCaption.trim() : null,
      sourceUrl: draft.sourceUrl || link,
    },
    ragHitCount: hits.length,
    ragWarning: warning,
  };
}
