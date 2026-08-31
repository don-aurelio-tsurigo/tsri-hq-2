export type RatingFilter = "all" | "eq1" | "eq2" | "eq3" | "eq4" | "eq5";

export const RATING_FILTERS: { value: RatingFilter; label: string }[] = [
  { value: "all", label: "Alle" },
  { value: "eq1", label: "= 1" },
  { value: "eq2", label: "= 2" },
  { value: "eq3", label: "= 3" },
  { value: "eq4", label: "= 4" },
  { value: "eq5", label: "= 5" },
];

export function matchesRatingFilter(
  rating: number | null | undefined,
  filter: RatingFilter,
): boolean {
  if (filter === "all") return true;
  const value = rating ?? 0;
  const target = Number(filter.slice(2));
  return value === target;
}
