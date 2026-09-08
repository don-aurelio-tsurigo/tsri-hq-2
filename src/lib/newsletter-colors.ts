/** Hex colors for newsletter / shift types (shared by Schichtplan + Newsletter). */

export const NEWSLETTER_TYPE_COLOR_DEFAULT = "#64748b";

/** Named defaults for known redaction types. */
export const NEWSLETTER_TYPE_COLORS_BY_NAME: Record<string, string> = {
  "Züri Briefing": "#1d4ed8",
  Wohnbrief: "#047857",
  Tsüritipp: "#b45309",
  "Gemeinderats-Briefing": "#6d28d9",
  "Gemeinderats Briefing": "#6d28d9",
  Repo: "#475569",
  "6iBrief": "#be185d",
};

/** Fallback palette for newly created types (cycled by sort order). */
export const NEWSLETTER_TYPE_COLOR_PALETTE = [
  "#1d4ed8",
  "#047857",
  "#b45309",
  "#6d28d9",
  "#be185d",
  "#0e7490",
  "#c2410c",
  "#4f46e5",
  "#15803d",
  "#a16207",
] as const;

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export function isNewsletterTypeColor(value: string): boolean {
  return HEX_COLOR_RE.test(value);
}

export function defaultColorForNewsletterType(
  name: string,
  sortIndex = 0,
): string {
  const named = NEWSLETTER_TYPE_COLORS_BY_NAME[name.trim()];
  if (named) return named;
  const palette = NEWSLETTER_TYPE_COLOR_PALETTE;
  return palette[Math.abs(sortIndex) % palette.length]!;
}

/** Soft wash background from a type color (inline style). */
export function newsletterTypeSoftBackground(color: string, amount = 14): string {
  const safe = isNewsletterTypeColor(color)
    ? color
    : NEWSLETTER_TYPE_COLOR_DEFAULT;
  return `color-mix(in oklab, ${safe} ${amount}%, transparent)`;
}
