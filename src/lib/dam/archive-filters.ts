import type { DamRightsType } from "@/lib/dam/types";

export type ArchiveFilters = {
  q: string;
  keyword: string;
  collectionId: string;
  rightsType: DamRightsType | "";
  credit: string;
  from: string;
  to: string;
};

function one(
  params: Record<string, string | string[] | undefined>,
  key: string,
): string {
  const value = params[key];
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value) && typeof value[0] === "string") return value[0].trim();
  return "";
}

export function parseArchiveFilters(
  params: Record<string, string | string[] | undefined>,
): ArchiveFilters {
  const rights = one(params, "rights");
  const from = one(params, "from");
  const to = one(params, "to");
  return {
    q: one(params, "q").slice(0, 120),
    keyword: one(params, "keyword").slice(0, 60),
    collectionId: one(params, "collection"),
    rightsType:
      rights === "own" || rights === "provided" || rights === "free_use" ? rights : "",
    credit: one(params, "credit").slice(0, 200),
    from: /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : "",
    to: /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : "",
  };
}

export function archiveFiltersActive(filters: ArchiveFilters): boolean {
  return Boolean(
    filters.q ||
      filters.keyword ||
      filters.collectionId ||
      filters.rightsType ||
      filters.credit ||
      filters.from ||
      filters.to,
  );
}
