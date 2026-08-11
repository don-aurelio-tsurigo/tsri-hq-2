import { toPgVectorLiteral } from "@/lib/rag/embed-query";
import { ragDatabaseHost, ragQuery } from "@/lib/rag/db";

export const DEFAULT_SEARCH_LIMIT = 8;
export const DEFAULT_RECENCY_WEIGHT = 0.015;
export const MAX_QUERY_CHARS = 500;
export const MAX_LIMIT = 30;

export type RagSearchParams = {
  queryEmbedding: number[];
  limit?: number;
  recencyWeight?: number;
  /** Drop hits with adjustedScore below this (e.g. 0.55 for article generation). */
  minAdjustedScore?: number;
  author?: string | null;
  tag?: string | null;
};

export type RagSearchHit = {
  title: string | null;
  url: string | null;
  publishedAt: string | null;
  authors: string[];
  tags: string[];
  chunkText: string;
  cosineSimilarity: number;
  adjustedScore: number;
};

type RawHit = {
  title: string | null;
  url: string | null;
  published_at: Date | string | null;
  authors: unknown;
  tags: unknown;
  chunk_text: string;
  similarity: number;
};

function yearsSince(
  publishedAt: Date | string | null | undefined,
  now: Date,
): number {
  if (publishedAt == null) return 0;
  const d = publishedAt instanceof Date ? publishedAt : new Date(publishedAt);
  if (Number.isNaN(d.getTime())) return 0;
  return Math.max(0, (now.getTime() - d.getTime()) / (365.25 * 86400 * 1000));
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

function truncateChunk(text: string, max = 300): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

function formatPublishedAt(value: Date | string | null): string | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export async function countRagChunks(): Promise<number> {
  const rows = await ragQuery<{ n: number }>(
    `SELECT count(*)::int AS n FROM rag.article_chunks WHERE embedding_vec IS NOT NULL`,
  );
  return rows[0]?.n ?? 0;
}

/**
 * Cosine nearest-neighbour via HNSW, then re-rank with recency bias in-process
 * (keeps the <=> ORDER BY indexable; adjusted score is not a pure vector op).
 */
export async function searchRagChunks(
  params: RagSearchParams,
): Promise<RagSearchHit[]> {
  const limit = Math.min(
    Math.max(1, params.limit ?? DEFAULT_SEARCH_LIMIT),
    MAX_LIMIT,
  );
  const recencyWeight = Math.max(0, params.recencyWeight ?? DEFAULT_RECENCY_WEIGHT);
  const author = params.author?.trim() || null;
  const tag = params.tag?.trim() || null;

  const fetchLimit =
    recencyWeight > 0 ? Math.min(Math.max(limit * 10, 50), 200) : limit;

  const vecLiteral = toPgVectorLiteral(params.queryEmbedding);
  const values: unknown[] = [vecLiteral];
  const filters: string[] = ["c.embedding_vec IS NOT NULL"];

  if (author) {
    values.push(author);
    filters.push(`a.authors::text ILIKE '%' || $${values.length} || '%'`);
  }
  if (tag) {
    values.push(tag);
    filters.push(`a.tags::text ILIKE '%' || $${values.length} || '%'`);
  }

  values.push(fetchLimit);
  const limitParam = `$${values.length}`;

  const rows = await ragQuery<RawHit>(
    `
    SELECT
      a.title,
      a.url,
      a.published_at,
      a.authors,
      a.tags,
      c.chunk_text,
      (1 - (c.embedding_vec <=> $1::vector))::float8 AS similarity
    FROM rag.article_chunks c
    JOIN rag.articles a ON a.id = c.article_id
    WHERE ${filters.join(" AND ")}
    ORDER BY c.embedding_vec <=> $1::vector
    LIMIT ${limitParam}
    `,
    values,
  );

  const now = new Date();
  const minAdjustedScore =
    params.minAdjustedScore != null && Number.isFinite(params.minAdjustedScore)
      ? params.minAdjustedScore
      : null;

  const ranked = rows
    .map((row) => {
      const cosine = Number(row.similarity);
      const adjusted = cosine - yearsSince(row.published_at, now) * recencyWeight;
      return {
        title: row.title,
        url: row.url,
        publishedAt: formatPublishedAt(row.published_at),
        authors: asStringArray(row.authors),
        tags: asStringArray(row.tags),
        chunkText: truncateChunk(row.chunk_text),
        cosineSimilarity: cosine,
        adjustedScore: adjusted,
      } satisfies RagSearchHit;
    })
    .sort((a, b) => b.adjustedScore - a.adjustedScore);

  const filtered =
    minAdjustedScore == null
      ? ranked
      : ranked.filter((hit) => hit.adjustedScore >= minAdjustedScore);

  return filtered.slice(0, limit);
}

export { ragDatabaseHost };
