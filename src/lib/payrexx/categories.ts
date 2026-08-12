import type { CategoryMeta } from "./types";
import { FEES_KEY, UNMAPPED_KEY } from "./types";

export const CATEGORIES: Record<string, CategoryMeta> = {
  memberspenden: { label: "Memberspenden", mwst: "SPE" },
  memberspenden_6ibrief: { label: "Memberspenden 6iBrief", mwst: "SPE" },
  spenden_6ibrief: { label: "Spenden 6iBrief", mwst: "SPE" },
  shopify: { label: "Shopify", mwst: null },
  spenden: { label: "Spenden", mwst: "SPE" },
  crowdfundings: { label: "Crowdfundings", mwst: "SPE" },
  ticketverkaeufe: { label: "Ticketverkäufe für Events", mwst: "UN81" },
  gebuehren: { label: "Gebühren", mwst: null },
  unmapped: { label: "Nicht zugeordnet", mwst: null },
};

/** Exact Zahlungskanal → category key */
export const CHANNEL_RULES: Record<string, string> = {
  Vorautorisierung: "memberspenden",
  "We.Publish": "memberspenden",
  "6iBrief Mitgliedschaft (Monatlich)": "memberspenden_6ibrief",
  "6iBrief Mitgliedschaft (jährlich)": "memberspenden_6ibrief",
  "6iBrief Spende": "spenden_6ibrief",
  "Tsüri Unterstützen": "spenden",
  Shopify: "shopify",
};

/** Case-insensitive substring match on channel + description */
export const CONTAINS_RULES: { pattern: string; category: string }[] = [
  { pattern: "community-funding", category: "crowdfundings" },
  { pattern: "crowdfunding", category: "crowdfundings" },
];

export function categoryLabel(key: string): string {
  return CATEGORIES[key]?.label ?? key;
}

export function categoryMwst(key: string): string | null {
  return CATEGORIES[key]?.mwst ?? null;
}

/** Categories shown in the review UI dropdown (excluding system keys). */
export function assignableCategoryKeys(): string[] {
  return Object.keys(CATEGORIES).filter(
    (k) => k !== UNMAPPED_KEY && k !== FEES_KEY && k !== "payout_fee",
  );
}
