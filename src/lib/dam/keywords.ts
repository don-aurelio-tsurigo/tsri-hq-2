export const ASSET_KEYWORD_MAX = 24;
export const ASSET_KEYWORD_LENGTH = 60;
export const AI_KEYWORD_MAX = 12;
export const AI_KEYWORD_LENGTH = 40;
export const AI_KEYWORD_WORDS = 3;

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

/** Conservative AI tags: lowercase, short, visible-subject nouns only. */
function truncateAiKeyword(raw: string): string | null {
  const words = raw
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return null;
  return words.slice(0, AI_KEYWORD_WORDS).join(" ").slice(0, AI_KEYWORD_LENGTH);
}

export function sanitizeAiKeywords(values: string[]): string[] {
  const cleaned = values
    .map(truncateAiKeyword)
    .filter((keyword): keyword is string => Boolean(keyword));
  return uniqueKeywords(cleaned).slice(0, AI_KEYWORD_MAX);
}

/** Copy keywords across empty neighbors in upload sequence (series photos). */
export function fillSeriesKeywordGaps<
  T extends { r2Key: string; sequence: number; keywords: string[] },
>(items: T[]): T[] {
  if (items.length <= 1) return items;
  const sorted = [...items].sort((a, b) => a.sequence - b.sequence);
  const byKey = new Map(items.map((item) => [item.r2Key, [...item.keywords]]));

  let last: string[] = [];
  for (const item of sorted) {
    const current = byKey.get(item.r2Key)!;
    if (current.length > 0) last = current;
    else if (last.length > 0) byKey.set(item.r2Key, [...last]);
  }
  last = [];
  for (const item of [...sorted].reverse()) {
    const current = byKey.get(item.r2Key)!;
    if (current.length > 0) last = current;
    else if (last.length > 0) byKey.set(item.r2Key, [...last]);
  }
  return items.map((item) => ({
    ...item,
    keywords: byKey.get(item.r2Key) ?? item.keywords,
  }));
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
