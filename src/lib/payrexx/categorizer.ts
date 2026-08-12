import { CATEGORIES, CHANNEL_RULES, CONTAINS_RULES } from "./categories";
import { guessChannelFromReferences } from "./channel-guess";
import type { LineItem } from "./types";
import { PAYOUT_FEE_KEY, UNMAPPED_KEY, isPayoutFee } from "./types";

export type ResolveResult = { key: string; source: string };

export function resolveLine(
  channel: string | null | undefined,
  description: string | null | undefined,
  learned: Record<string, string>,
): ResolveResult {
  if (channel && learned[channel]) {
    return { key: learned[channel]!, source: "learned" };
  }
  if (channel && CHANNEL_RULES[channel]) {
    return { key: CHANNEL_RULES[channel]!, source: "auto" };
  }

  const haystack = [channel, description]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (haystack) {
    for (const rule of CONTAINS_RULES) {
      if (rule.pattern && haystack.includes(rule.pattern.toLowerCase())) {
        return { key: rule.category, source: "auto" };
      }
    }
  }

  return { key: UNMAPPED_KEY, source: "auto" };
}

export function categorizeLines(
  lines: LineItem[],
  learned: Record<string, string> = {},
): LineItem[] {
  for (const line of lines) {
    if (isPayoutFee(line)) {
      line.categoryKey = PAYOUT_FEE_KEY;
      line.categorySource = "auto";
      continue;
    }
    if (!line.channel && line.externalReference) {
      const guessed = guessChannelFromReferences(line.externalReference);
      if (guessed) line.channel = guessed;
    }
    const { key, source } = resolveLine(line.channel, line.description, learned);
    line.categoryKey = key;
    line.categorySource = source;
  }
  return lines;
}

export function ensureCategoryKnown(key: string): boolean {
  return key in CATEGORIES || key === PAYOUT_FEE_KEY;
}
