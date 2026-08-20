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
    .resize({ width: 1280, withoutEnlargement: true })
    .jpeg({ quality: 72 })
    .toBuffer();
}

export async function autotagFromImageBuffer(
  userId: string,
  buffer: Buffer,
): Promise<AutotagResult> {
  const jpeg = await jpegForAutotag(buffer);
  return autotagImage(userId, jpeg);
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

  const quota = await consumeMemberQuota(userId, "ai");
  if (!quota.ok) {
    console.warn("[dam] autotag skipped: quota", quota.error);
    return { altText: null, keywords: [], skipped: "quota" };
  }

  try {
    const response = await client.messages.create({
      model: getModel(),
      max_tokens: 600,
      tools: [
        {
          name: TOOL_NAME,
          description:
            "Liefert Alt-Text und konservative Keywords für ein journalistisches Archivfoto. Kein redaktioneller Kontext, keine Bildunterschrift, keine Notes.",
          input_schema: {
            type: "object",
            additionalProperties: false,
            required: ["altText", "keywords"],
            properties: {
              altText: {
                type: "string",
                description:
                  "Ein präziser deutscher Alt-Text (max. 160 Zeichen), der nur das klar sichtbare Motiv beschreibt.",
              },
              keywords: {
                type: "array",
                items: { type: "string" },
                description:
                  "5–12 kurze deutsche Keywords in Kleinschreibung. Nur sichtbar: Orte, Motive, Objekte, Stimmung. Max. 3 Wörter pro Keyword.",
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
              text: [
                "Tagge dieses Foto für das Bildarchiv von Tsüri.ch.",
                "Sprache: Deutsch. Keywords kleingeschrieben.",
                "Nur klar Sichtbares: Motive, Orte, Objekte, Stimmungen.",
                "Keine Personennamen erfinden (nur wenn auf Schild/Trikot lesbar).",
                "Keine Marken erfinden (nur wenn klar lesbar).",
                "Kein Ereignis-, Termin- oder Redaktionskontext — das gehört in Notes.",
                "Lieber weniger und treffsicher, keine Synonym-Listen.",
                "5–12 Keywords, jedes maximal drei Wörter.",
              ].join(" "),
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
    const input = toolBlock.input as { altText?: unknown; keywords?: unknown };
    const altText =
      typeof input.altText === "string" && input.altText.trim()
        ? input.altText.trim().slice(0, 240)
        : null;
    const keywords = sanitizeAiKeywords(
      Array.isArray(input.keywords)
        ? input.keywords.filter((item): item is string => typeof item === "string")
        : [],
    );
    return { altText, keywords };
  } catch (error) {
    await refundMemberQuota(quota.id);
    throw error;
  }
}
