export type RatingFilter = "all" | "gte2" | "gte3" | "gte4" | "eq5";

export const RATING_FILTERS: { value: RatingFilter; label: string }[] = [
  { value: "all", label: "Alle" },
  { value: "gte2", label: "≥ 2" },
  { value: "gte3", label: "≥ 3" },
  { value: "gte4", label: "≥ 4" },
  { value: "eq5", label: "= 5" },
];

export function matchesRatingFilter(
  rating: number | null | undefined,
  filter: RatingFilter,
): boolean {
  if (filter === "all") return true;
  const value = rating ?? 0;
  if (filter === "eq5") return value === 5;
  if (filter === "gte4") return value >= 4;
  if (filter === "gte3") return value >= 3;
  return value >= 2;
}
