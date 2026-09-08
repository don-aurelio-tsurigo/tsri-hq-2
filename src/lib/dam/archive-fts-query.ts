/**
 * Build a PostgreSQL `simple` tsquery with prefix matching (`token:*`).
 * Non-alphanumeric characters are treated as separators (same idea as dam_search_normalize).
 */
export function buildArchiveFtsQuery(raw: string): string | null {
  const tokens = raw
    .trim()
    .toLocaleLowerCase("de-CH")
    .split(/[^\p{L}\p{N}]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length > 0)
    .slice(0, 12);
  if (tokens.length === 0) return null;
  return tokens.map((token) => `${token}:*`).join(" & ");
}
