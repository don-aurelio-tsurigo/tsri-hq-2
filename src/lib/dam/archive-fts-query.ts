/**
 * Build a PostgreSQL `simple` tsquery.
 * Non-alphanumeric characters are treated as separators (same idea as dam_search_normalize).
 *
 * Short tokens (< {@link ARCHIVE_FTS_PREFIX_MIN}) are exact matches so `bar` does not
 * hit `barrierefreiheit`. Longer tokens keep prefix matching (`bingo` → `bingo_08`).
 */
export const ARCHIVE_FTS_MIN_CHARS = 2;
/** Tokens shorter than this are matched exactly (no `:*` prefix). */
export const ARCHIVE_FTS_PREFIX_MIN = 4;

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

/** Normalized phrase for LIKE boosts (spaces between tokens). */
export function archiveSearchPhrase(raw: string): string | null {
  const tokens = tokenizeArchiveQuery(raw);
  if (tokens.length === 0) return null;
  return tokens.join(" ");
}

function tokenToTsTerm(token: string): string {
  return token.length >= ARCHIVE_FTS_PREFIX_MIN ? `${token}:*` : token;
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
  return tokens.map(tokenToTsTerm).join(joiner);
}
