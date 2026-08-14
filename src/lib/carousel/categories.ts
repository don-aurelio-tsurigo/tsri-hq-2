/** Tsüri Instagram slide themes by editorial category. */

export const DEFAULT_CATEGORY = "STADTLEBEN";
/** Fallback / STADTLEBEN gold–ochre from production slides */
export const DEFAULT_BG = "#b9935e";

export type SlideInk = "light" | "dark";

export type CategoryTheme = {
  backgroundColor: string;
  /** light = white text, dark = near-black text */
  ink: SlideInk;
};

/**
 * Measured from Tsüri Canva templates.
 * Unknown categories fall back to STADTLEBEN.
 */
export const CATEGORY_THEMES: Record<string, CategoryTheme> = {
  STADTLEBEN: { backgroundColor: DEFAULT_BG, ink: "light" },
  KOLUMNE: { backgroundColor: "#fe703e", ink: "dark" },
  KULTUR: { backgroundColor: "#00b8b6", ink: "light" },
  MOBILITÄT: { backgroundColor: "#545454", ink: "light" },
  KLIMA: { backgroundColor: "#99ce00", ink: "dark" },
  WOHNEN: { backgroundColor: "#643a7c", ink: "light" },
  POLITIK: { backgroundColor: "#e8b643", ink: "dark" },
  TIPP: { backgroundColor: "#00b8b6", ink: "light" },
};

export function normalizeCarouselCategory(raw: string): string {
  const cleaned = raw
    .trim()
    .toUpperCase()
    .replace(/[^A-ZÄÖÜ0-9\s\-]/g, "")
    .replace(/\s+/g, " ");
  if (!cleaned) return DEFAULT_CATEGORY;
  // ASCII fallback for umlauts (e.g. MOBILITAT → MOBILITÄT)
  if (cleaned === "MOBILITAT") return "MOBILITÄT";
  return cleaned;
}

export function themeForCategory(category: string): CategoryTheme {
  const key = normalizeCarouselCategory(category);
  return CATEGORY_THEMES[key] ?? CATEGORY_THEMES[DEFAULT_CATEGORY]!;
}

export function backgroundColorForCategory(category: string): string {
  return themeForCategory(category).backgroundColor;
}

export function defaultInkForCategory(category: string): SlideInk {
  return themeForCategory(category).ink;
}

export function resolveSlideInk(slide: {
  category: string;
  ink?: SlideInk | null;
}): SlideInk {
  if (slide.ink === "light" || slide.ink === "dark") return slide.ink;
  return defaultInkForCategory(slide.category);
}

export function inkCssColor(ink: SlideInk): string {
  return ink === "dark" ? "#111111" : "#ffffff";
}

/** Block for the LLM system prompt: known categories + hex colors. */
export function categoryColorPromptBlock(): string {
  const lines = Object.entries(CATEGORY_THEMES).map(([name, theme]) => {
    const inkNote = theme.ink === "dark" ? ", Text schwarz" : ", Text weiss";
    return `- ${name} → ${theme.backgroundColor}${inkNote}`;
  });
  return [
    "Wähle genau eine category aus dieser Liste (unbekannt → STADTLEBEN):",
    ...lines,
  ].join("\n");
}
