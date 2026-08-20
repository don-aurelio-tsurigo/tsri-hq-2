export const ASSET_KEYWORD_MAX = 24;
export const ASSET_KEYWORD_LENGTH = 60;

export function uniqueKeywords(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const keyword = raw.trim().slice(0, ASSET_KEYWORD_LENGTH);
    if (!keyword) continue;
    const key = keyword.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(keyword);
  }
  return out.slice(0, ASSET_KEYWORD_MAX);
}

export function applyKeywordChanges(
  existing: string[],
  add: string[],
  remove: string[],
): string[] {
  const merged = uniqueKeywords([...existing, ...add]);
  if (remove.length === 0) return merged;
  const drop = new Set(uniqueKeywords(remove).map((keyword) => keyword.toLowerCase()));
  return merged.filter((keyword) => !drop.has(keyword.toLowerCase()));
}
