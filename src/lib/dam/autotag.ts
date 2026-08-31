import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import { decodeHeicIfNeeded } from "@/lib/dam/heic";
import { sanitizeAiKeywords } from "@/lib/dam/keywords";
import { consumeMemberQuota, refundMemberQuota } from "@/lib/member-quota";

export type AutotagSkipReason = "no_key" | "quota";

export type AutotagResult = {
  altText: string | null;
  keywords: string[];
  skipped?: AutotagSkipReason;
};

const TOOL_NAME = "tag_photo";
const DAM_AUTOTAG_QUOTA_MAX = (() => {
  const raw = process.env.MEMBER_QUOTA_DAM_AUTOTAG_MAX?.trim();
  const parsed = raw ? Number(raw) : 120;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 120;
})();

function getModel(): string {
  return process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-5";
}

function getClient(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return null;
  return new Anthropic({ apiKey });
}

export async function jpegForAutotag(buffer: Buffer): Promise<Buffer> {
  const decoded = await decodeHeicIfNeeded(buffer);
  return sharp(decoded)
    .rotate()
    .resize({ width: 1536, withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
}

export async function autotagFromImageBuffer(
  userId: string,
  buffer: Buffer,
): Promise<AutotagResult> {
  const jpeg = await jpegForAutotag(buffer);
  return autotagImage(userId, jpeg);
}

function autotagInstructions(strict: boolean): string {
  const base = [
    "Tagge dieses Foto für das Bildarchiv von Tsüri.ch.",
    "Sprache: Deutsch. Schweizer Rechtschreibung (kein ß, immer ss). Keywords kleingeschrieben.",
    "Nur klar Sichtbares: Motive, Orte, Objekte, Stimmungen, Farben, Wetter.",
    "Keine Personennamen erfinden (nur wenn auf Schild/Trikot lesbar).",
    "Keine Marken erfinden (nur wenn klar lesbar).",
    "Kein Ereignis-, Termin- oder Redaktionskontext — das gehört in Notes.",
    "Auch bei Serienfotos mit ähnlichem Bildausschnitt die sichtbaren Motive taggen.",
    "Jedes Keyword maximal drei Wörter.",
    "Mindestens 5 Keywords, wenn überhaupt etwas erkennbar ist.",
  ];
  if (strict) {
    base.push(
      "Das letzte Ergebnis hatte keine Keywords. Liste jetzt alle erkennbaren Motive auf — auch neutrale Szenen, Gebäude, Menschenmengen, Natur, Verkehr, Innenräume.",
      "Leeres keywords-Array nur bei völlig unbrauchbaren oder reinen Farbflächen.",
    );
  } else {
    base.push("5–12 Keywords, keine Synonym-Listen.");
  }
  return base.join(" ");
}

function parseAutotagToolInput(input: unknown): AutotagResult {
  if (!input || typeof input !== "object") {
    return { altText: null, keywords: [] };
  }
  const record = input as { altText?: unknown; keywords?: unknown };
  const altText =
    typeof record.altText === "string" && record.altText.trim()
      ? record.altText.trim().slice(0, 240)
      : null;
  const keywords = sanitizeAiKeywords(
    Array.isArray(record.keywords)
      ? record.keywords.filter((item): item is string => typeof item === "string")
      : [],
  );
  return { altText, keywords };
}

async function callAutotag(
  client: Anthropic,
  jpegBytes: Buffer,
  strict: boolean,
): Promise<AutotagResult> {
  const response = await client.messages.create({
    model: getModel(),
    max_tokens: 600,
    tools: [
      {
        name: TOOL_NAME,
        description:
          "Liefert Alt-Text und Keywords für ein journalistisches Archivfoto. Kein redaktioneller Kontext, keine Bildunterschrift, keine Notes. Schweizer Rechtschreibung (kein ß, immer ss).",
        input_schema: {
          type: "object",
          additionalProperties: false,
          required: ["altText", "keywords"],
          properties: {
            altText: {
              type: "string",
              description:
                "Ein präziser deutscher Alt-Text (max. 160 Zeichen), der nur das klar sichtbare Motiv beschreibt. Schweizer Rechtschreibung (kein ß, immer ss).",
            },
            keywords: {
              type: "array",
              minItems: 5,
              items: { type: "string" },
              description:
                "5–12 kurze deutsche Keywords in Kleinschreibung. Nur sichtbar: Orte, Motive, Objekte, Stimmung. Max. 3 Wörter pro Keyword. Schweizer Rechtschreibung (kein ß, immer ss).",
            },
          },
        },
      },
    ],
    tool_choice: { type: "tool", name: TOOL_NAME },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/jpeg",
              data: jpegBytes.toString("base64"),
            },
          },
          {
            type: "text",
            text: autotagInstructions(strict),
          },
        ],
      },
    ],
  });

  const toolBlock = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
  );
  if (!toolBlock || typeof toolBlock.input !== "object" || !toolBlock.input) {
    return { altText: null, keywords: [] };
  }
  return parseAutotagToolInput(toolBlock.input);
}

export async function autotagImage(
  userId: string,
  jpegBytes: Buffer,
): Promise<AutotagResult> {
  const client = getClient();
  if (!client) {
    console.warn("[dam] autotag skipped: ANTHROPIC_API_KEY missing");
    return { altText: null, keywords: [], skipped: "no_key" };
  }

  const quota = await consumeMemberQuota(userId, "ai", { max: DAM_AUTOTAG_QUOTA_MAX });
  if (!quota.ok) {
    console.warn("[dam] autotag skipped: quota", quota.error);
    return { altText: null, keywords: [], skipped: "quota" };
  }

  try {
    let result = await callAutotag(client, jpegBytes, false);
    if (result.keywords.length === 0) {
      const retry = await callAutotag(client, jpegBytes, true);
      if (retry.keywords.length > 0 || retry.altText) {
        result = {
          altText: retry.altText ?? result.altText,
          keywords: retry.keywords.length > 0 ? retry.keywords : result.keywords,
        };
      }
    }
    return result;
  } catch (error) {
    await refundMemberQuota(quota.id);
    throw error;
  }
}
