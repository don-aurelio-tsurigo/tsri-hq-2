import Anthropic from "@anthropic-ai/sdk";
import { consumeMemberQuota, refundMemberQuota } from "@/lib/member-quota";

export type AutotagResult = {
  altText: string | null;
  keywords: string[];
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

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export async function autotagImage(
  userId: string,
  jpegBytes: Buffer,
): Promise<AutotagResult> {
  const client = getClient();
  if (!client) {
    return { altText: null, keywords: [] };
  }

  const quota = await consumeMemberQuota(userId, "ai");
  if (!quota.ok) {
    return { altText: null, keywords: [] };
  }

  try {
    const response = await client.messages.create({
      model: getModel(),
      max_tokens: 600,
      tools: [
        {
          name: TOOL_NAME,
          description:
            "Liefert Alt-Text und Keywords für ein journalistisches Archivfoto.",
          input_schema: {
            type: "object",
            additionalProperties: false,
            required: ["altText", "keywords"],
            properties: {
              altText: {
                type: "string",
                description:
                  "Ein präziser deutscher Alt-Text (max. 160 Zeichen), der Motiv, Ort und relevante Personen beschreibt.",
              },
              keywords: {
                type: "array",
                items: { type: "string" },
                description:
                  "5–12 kurze deutsche Keywords in Kleinschreibung (Orte, Motive, Themen).",
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
              text: "Tagge dieses Foto für das Bildarchiv von Tsüri.ch. Sprache: Deutsch. Keine Markennamen erfinden.",
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
    return { altText, keywords: asStringArray(input.keywords).slice(0, 16) };
  } catch (error) {
    await refundMemberQuota(quota.id);
    throw error;
  }
}
