export const CAROUSEL_FORMATS = [
  "auto",
  "standard",
  "kolumne",
  "interview",
  "tsueritipp",
  "6ibrief",
] as const;

export type CarouselFormat = (typeof CAROUSEL_FORMATS)[number];

export const CAROUSEL_FORMAT_LABELS: Record<CarouselFormat, string> = {
  auto: "Automatisch erkennen",
  standard: "Standard",
  kolumne: "Kolumne",
  interview: "Interview",
  tsueritipp: "Tsüritipp",
  "6ibrief": "6iBrief",
};

export function parseCarouselFormat(value: unknown): CarouselFormat {
  if (
    typeof value === "string" &&
    (CAROUSEL_FORMATS as readonly string[]).includes(value)
  ) {
    return value as CarouselFormat;
  }
  return "auto";
}
