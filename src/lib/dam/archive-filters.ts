import type { DamRightsType } from "@/lib/dam/types";

export const ARCHIVE_FACET_LIMIT = 200;
export const ARCHIVE_FACET_SEARCH_LIMIT = 40;
export const ARCHIVE_KEYWORD_MAX = 20;

export type ArchiveFilters = {
  q: string;
  keywords: string[];
  collectionId: string;
  rightsType: DamRightsType | "";
  credit: string;
  from: string;
  to: string;
};

export const EMPTY_ARCHIVE_FILTERS: ArchiveFilters = {
  q: "",
  keywords: [],
  collectionId: "",
  rightsType: "",
  credit: "",
  from: "",
  to: "",
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

function many(
  params: Record<string, string | string[] | undefined>,
  key: string,
): string[] {
  const value = params[key];
  const raw = Array.isArray(value) ? value : value ? [value] : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const trimmed = item.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

export function parseArchiveFilters(
  params: Record<string, string | string[] | undefined>,
): ArchiveFilters {
  const rights = one(params, "rights");
  const from = one(params, "from");
  const to = one(params, "to");
  return {
    q: one(params, "q").slice(0, 120),
    keywords: many(params, "keyword")
      .map((keyword) => keyword.slice(0, 60))
      .slice(0, ARCHIVE_KEYWORD_MAX),
    collectionId: one(params, "collection"),
    rightsType:
      rights === "own" || rights === "provided" || rights === "free_use" ? rights : "",
    credit: one(params, "credit").slice(0, 200),
    from: /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : "",
    to: /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : "",
  };
}

export function archiveFiltersActive(filters: ArchiveFilters): boolean {
  return archiveFilterChipCount(filters) > 0;
}

/** Visible chips: every committed criterion, including search and collection. */
export function archiveFilterChipCount(filters: ArchiveFilters): number {
  return (
    (filters.q ? 1 : 0) +
    filters.keywords.length +
    (filters.collectionId ? 1 : 0) +
    (filters.rightsType ? 1 : 0) +
    (filters.credit ? 1 : 0) +
    (filters.from ? 1 : 0) +
    (filters.to ? 1 : 0)
  );
}

/** Extra panel only: tags, rights, credit, dates — not search/collection. */
export function hiddenArchiveFilterCount(filters: ArchiveFilters): number {
  return (
    filters.keywords.length +
    (filters.rightsType ? 1 : 0) +
    (filters.credit ? 1 : 0) +
    (filters.from ? 1 : 0) +
    (filters.to ? 1 : 0)
  );
}

export function archiveFiltersToSearchParams(filters: ArchiveFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  for (const keyword of filters.keywords) params.append("keyword", keyword);
  if (filters.collectionId) params.set("collection", filters.collectionId);
  if (filters.rightsType) params.set("rights", filters.rightsType);
  if (filters.credit) params.set("credit", filters.credit);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  return params;
}

export function archiveCollectionHref(collectionId: string): string {
  const qs = archiveFiltersToSearchParams({
    ...EMPTY_ARCHIVE_FILTERS,
    collectionId,
  }).toString();
  return `/dam/archive?${qs}`;
}

export function parseArchiveFiltersFromSearchParams(
  params: URLSearchParams,
): ArchiveFilters {
  const record: Record<string, string | string[]> = {};
  for (const key of new Set(params.keys())) {
    const all = params.getAll(key);
    record[key] = all.length > 1 ? all : (all[0] ?? "");
  }
  return parseArchiveFilters(record);
}
