/**
 * Build a PostgreSQL `simple` tsquery with prefix matching (`token:*`).
 * Non-alphanumeric characters are treated as separators (same idea as dam_search_normalize).
 */
export const ARCHIVE_FTS_MIN_CHARS = 2;

export type ArchiveFtsMode = "and" | "or";

export function tokenizeArchiveQuery(raw: string): string[] {
  return raw
    .trim()
    .toLocaleLowerCase("de-CH")
    .split(/[^\p{L}\p{N}]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length > 0)
    .slice(0, 12);
}

/**
 * Returns null when the query is empty or shorter than {@link ARCHIVE_FTS_MIN_CHARS}.
 */
export function buildArchiveFtsQuery(
  raw: string,
  mode: ArchiveFtsMode = "and",
): string | null {
  const trimmed = raw.trim();
  if (trimmed.length < ARCHIVE_FTS_MIN_CHARS) return null;
  const tokens = tokenizeArchiveQuery(trimmed);
  if (tokens.length === 0) return null;
  const joiner = mode === "or" ? " | " : " & ";
  return tokens.map((token) => `${token}:*`).join(joiner);
}
