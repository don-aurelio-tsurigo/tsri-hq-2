import type { Prisma } from "@/generated/prisma/client";

export type RatingOp = "eq" | "gte" | "lte";
export type RatingValue = 0 | 1 | 2 | 3 | 4 | 5;
export type RatingFilter = "all" | `${RatingOp}${RatingValue}`;

export const RATING_OPS: { value: RatingOp; label: string; title: string }[] = [
  { value: "eq", label: "=", title: "genau" },
  { value: "gte", label: "≥", title: "mindestens" },
  { value: "lte", label: "≤", title: "höchstens" },
];

export const RATING_VALUES: RatingValue[] = [0, 1, 2, 3, 4, 5];

const OP_SYMBOL: Record<RatingOp, string> = { eq: "=", gte: "≥", lte: "≤" };

/** Star glyphs for <option> labels, which cannot render icons. */
export function ratingValueStars(value: RatingValue): string {
  if (value === 0) return "Ohne Sterne";
  return "★".repeat(value) + "☆".repeat(5 - value);
}

export function ratingFilterParts(
  filter: RatingFilter,
): { op: RatingOp; value: RatingValue } | null {
  const match = /^(eq|gte|lte)([0-5])$/.exec(filter);
  if (!match) return null;
  return { op: match[1] as RatingOp, value: Number(match[2]) as RatingValue };
}

/** ≥ 0 and ≤ 5 match every photo, so they collapse to "all". */
export function isNoopRatingFilter(op: RatingOp, value: RatingValue): boolean {
  return (op === "gte" && value === 0) || (op === "lte" && value === 5);
}

export function makeRatingFilter(
  op: RatingOp,
  value: RatingValue | null,
): RatingFilter {
  if (value == null || isNoopRatingFilter(op, value)) return "all";
  return `${op}${value}`;
}

export function matchesRatingFilter(
  rating: number | null | undefined,
  filter: RatingFilter,
): boolean {
  const parts = ratingFilterParts(filter);
  if (!parts) return true;
  const value = rating ?? 0;
  if (parts.op === "gte") return value >= parts.value;
  if (parts.op === "lte") return value <= parts.value;
  return value === parts.value;
}

/** Unrated photos (null) count as 0 stars. */
export function ratingWhereInput(
  filter: RatingFilter,
): Prisma.AssetWhereInput | undefined {
  const parts = ratingFilterParts(filter);
  if (!parts) return undefined;
  const { op, value } = parts;
  if (op === "gte") return { rating: { gte: value } };
  if (op === "lte") return { OR: [{ rating: null }, { rating: { lte: value } }] };
  if (value === 0) return { OR: [{ rating: null }, { rating: 0 }] };
  return { rating: value };
}

/** Bare digits stay "= N" so older links keep working. */
export function parseRatingFilterParam(raw: string): RatingFilter {
  if (/^[0-5]$/.test(raw)) return `eq${raw}` as RatingFilter;
  const parts = ratingFilterParts(raw as RatingFilter);
  if (!parts) return "all";
  return makeRatingFilter(parts.op, parts.value);
}

export function ratingFilterToParam(filter: RatingFilter): string {
  const parts = ratingFilterParts(filter);
  if (!parts) return "";
  return parts.op === "eq" ? String(parts.value) : filter;
}

export function ratingFilterLabel(filter: RatingFilter): string {
  const parts = ratingFilterParts(filter);
  if (!parts) return "Alle";
  return `${OP_SYMBOL[parts.op]} ${parts.value}`;
}
