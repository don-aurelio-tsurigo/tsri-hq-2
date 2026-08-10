/**
 * Incremental RAG sync: WePublish → chunk → Voyage → upsert rag.*
 * Designed to run inside the HQ Node process on Render (no truncate / HNSW rebuild).
 */

import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { toPgVectorLiteral, VoyageEmbedError } from "@/lib/rag/embed-query";
import { embedDocuments } from "@/lib/rag/embed-documents";
import { getRagPool, withRagClient } from "@/lib/rag/db";
import {
  chunkWordCount,
  extractRagArticle,
  type ExtractedRagArticle,
  type WepublishApiArticle,
} from "@/lib/rag/wepublish-extract";
import { wepublishGraphql, WepublishApiError } from "@/lib/wepublish/client";

const SYNC_CURSOR_KEY = "wepublish_last_published_at";
const DEFAULT_PAGE_SIZE = 25;
const DEFAULT_LIMIT = 100;
const DEFAULT_DELAY_MS = 100;
const DEFAULT_EMBED_BATCH = 32;
/** Re-fetch a day before the cursor so same-day publishes / late edits are covered. */
const LOOKBACK_MS = 24 * 60 * 60 * 1000;

export type RagSyncSummary = {
  skipped: boolean;
  reason?: string;
  fetched: number;
  upserted: number;
  chunks: number;
  skippedEmpty: number;
  errors: number;
  since: string | null;
  cursorAdvancedTo: string | null;
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function isSyncEnabled(): boolean {
  const flag = process.env.RAG_SYNC_ENABLED?.trim().toLowerCase();
  if (flag === "0" || flag === "false" || flag === "off") return false;
  if (flag === "1" || flag === "true" || flag === "on") return true;
  // Default: on when Voyage is configured (Render production).
  return Boolean(process.env.VOYAGE_API_KEY?.trim());
}

async function ensureSyncStateTable(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS rag.sync_state (
      key TEXT PRIMARY KEY,
      value_timestamptz TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function readCursor(client: PoolClient): Promise<Date | null> {
  await ensureSyncStateTable(client);
  const fromState = await client.query<{ value_timestamptz: Date | null }>(
    `SELECT value_timestamptz FROM rag.sync_state WHERE key = $1`,
    [SYNC_CURSOR_KEY],
  );
  const stored = fromState.rows[0]?.value_timestamptz;
  if (stored) return new Date(stored);

  const fromArchive = await client.query<{ max: Date | null }>(
    `SELECT MAX(published_at) AS max FROM rag.articles`,
  );
  const max = fromArchive.rows[0]?.max;
  return max ? new Date(max) : null;
}

async function writeCursor(client: PoolClient, at: Date): Promise<void> {
  await ensureSyncStateTable(client);
  await client.query(
    `
    INSERT INTO rag.sync_state (key, value_timestamptz, updated_at)
    VALUES ($1, $2, NOW())
    ON CONFLICT (key) DO UPDATE SET
      value_timestamptz = EXCLUDED.value_timestamptz,
      updated_at = NOW()
    `,
    [SYNC_CURSOR_KEY, at.toISOString()],
  );
}

function toSinceDay(cursor: Date): string {
  const lookback = new Date(cursor.getTime() - LOOKBACK_MS);
  return lookback.toISOString().slice(0, 10);
}

function articlesFilterGraphql(sinceDay: string): string {
  const iso = `${sinceDay}T00:00:00.000Z`;
  return `published: true, publicationDateFrom: { comparison: GreaterThanOrEqual, date: "${iso}" }`;
}

function buildArticlesPageQuery(sinceDay: string): string {
  return /* GraphQL */ `
  query RagSyncArticles($take: Int!, $skip: Int!) {
    articles(
      take: $take
      skip: $skip
      order: Ascending
      sort: PublishedAt
      filter: { ${articlesFilterGraphql(sinceDay)} }
    ) {
      totalCount
      nodes {
        id
        slug
        url
        publishedAt
        tags { tag }
        published {
          title
          lead
          authors { name }
          image { url }
          blocks {
            __typename
            ... on RichTextBlock { richText }
            ... on QuoteBlock { quote author }
            ... on ImageBlock { caption }
          }
        }
      }
    }
  }
`;
}

async function fetchArticlesSince(
  sinceDay: string,
  limit: number,
  pageSize: number,
  delayMs: number,
): Promise<WepublishApiArticle[]> {
  const nodes: WepublishApiArticle[] = [];
  let skip = 0;

  while (nodes.length < limit) {
    const take = Math.min(pageSize, limit - nodes.length);
    if (skip > 0 || delayMs > 0) await sleep(delayMs);

    const data = await wepublishGraphql<{
      articles: { totalCount: number; nodes: WepublishApiArticle[] };
    }>(buildArticlesPageQuery(sinceDay), { take, skip });

    const page = data.articles.nodes ?? [];
    nodes.push(...page);
    if (page.length < take) break;
    skip += take;
  }

  return nodes;
}

async function upsertArticleWithEmbeddings(
  client: PoolClient,
  article: ExtractedRagArticle,
  embeddings: number[][],
): Promise<void> {
  if (embeddings.length !== article.chunks.length) {
    throw new Error(
      `Embedding-Länge ${embeddings.length} ≠ Chunks ${article.chunks.length} (${article.wepublishId})`,
    );
  }

  const upsert = await client.query<{ id: string }>(
    `
    INSERT INTO rag.articles (
      id, wepublish_id, slug, url, title, lead, published_at,
      authors, tags, image_url, raw_word_count, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7,
      $8::jsonb, $9::jsonb, $10, $11, NOW()
    )
    ON CONFLICT (wepublish_id) DO UPDATE SET
      slug = EXCLUDED.slug,
      url = EXCLUDED.url,
      title = EXCLUDED.title,
      lead = EXCLUDED.lead,
      published_at = EXCLUDED.published_at,
      authors = EXCLUDED.authors,
      tags = EXCLUDED.tags,
      image_url = EXCLUDED.image_url,
      raw_word_count = EXCLUDED.raw_word_count,
      updated_at = NOW()
    RETURNING id
    `,
    [
      randomUUID(),
      article.wepublishId,
      article.slug,
      article.url,
      article.title,
      article.lead,
      article.publishedAt,
      JSON.stringify(article.authors),
      JSON.stringify(article.tags),
      article.imageUrl,
      article.rawWordCount,
    ],
  );
  const articleId = upsert.rows[0]!.id;

  await client.query(`DELETE FROM rag.article_chunks WHERE article_id = $1`, [
    articleId,
  ]);

  if (article.chunks.length === 0) return;

  const values: unknown[] = [];
  const placeholders: string[] = [];
  let p = 1;
  for (let i = 0; i < article.chunks.length; i++) {
    const text = article.chunks[i]!;
    const vec = toPgVectorLiteral(embeddings[i]!);
    placeholders.push(
      `($${p++}::uuid, $${p++}::uuid, $${p++}::int, $${p++}::text, $${p++}::int, $${p++}::int, $${p++}::vector, NOW())`,
    );
    values.push(
      randomUUID(),
      articleId,
      i,
      text,
      text.length,
      chunkWordCount(text),
      vec,
    );
  }

  await client.query(
    `
    INSERT INTO rag.article_chunks (
      id, article_id, chunk_index, chunk_text, char_count, word_count, embedding_vec, updated_at
    ) VALUES ${placeholders.join(", ")}
    `,
    values,
  );
}

/**
 * Pull new/recent WePublish articles into rag.* with embeddings.
 */
export async function runRagSync(): Promise<RagSyncSummary> {
  if (!isSyncEnabled()) {
    return {
      skipped: true,
      reason: "RAG sync disabled (RAG_SYNC_ENABLED off or VOYAGE_API_KEY missing)",
      fetched: 0,
      upserted: 0,
      chunks: 0,
      skippedEmpty: 0,
      errors: 0,
      since: null,
      cursorAdvancedTo: null,
    };
  }

  if (!process.env.VOYAGE_API_KEY?.trim()) {
    return {
      skipped: true,
      reason: "VOYAGE_API_KEY fehlt",
      fetched: 0,
      upserted: 0,
      chunks: 0,
      skippedEmpty: 0,
      errors: 0,
      since: null,
      cursorAdvancedTo: null,
    };
  }

  // Touch pool early so misconfigured URLs fail with a clear skip/log path.
  getRagPool();

  const limit = envInt("RAG_SYNC_LIMIT", DEFAULT_LIMIT);
  const pageSize = envInt("RAG_SYNC_PAGE_SIZE", DEFAULT_PAGE_SIZE);
  const delayMs = envInt("RAG_SYNC_DELAY_MS", DEFAULT_DELAY_MS);
  const embedBatch = Math.min(
    128,
    envInt("RAG_SYNC_EMBED_BATCH", DEFAULT_EMBED_BATCH),
  );

  const cursor = await withRagClient((client) => readCursor(client));
  if (!cursor) {
    return {
      skipped: true,
      reason:
        "Leeres RAG-Archiv und kein Sync-Cursor — zuerst Vollimport (db:import-rag) ausführen",
      fetched: 0,
      upserted: 0,
      chunks: 0,
      skippedEmpty: 0,
      errors: 0,
      since: null,
      cursorAdvancedTo: null,
    };
  }

  const sinceDay = toSinceDay(cursor);
  let nodes: WepublishApiArticle[];
  try {
    nodes = await fetchArticlesSince(sinceDay, limit, pageSize, delayMs);
  } catch (err) {
    const message =
      err instanceof WepublishApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err);
    throw new Error(`WePublish-Fetch fehlgeschlagen: ${message}`);
  }

  const summary: RagSyncSummary = {
    skipped: false,
    fetched: nodes.length,
    upserted: 0,
    chunks: 0,
    skippedEmpty: 0,
    errors: 0,
    since: sinceDay,
    cursorAdvancedTo: null,
  };

  let maxSuccessfulPublished: Date | null = null;

  for (const node of nodes) {
    const extracted = extractRagArticle(node);
    if (!extracted) {
      summary.skippedEmpty += 1;
      continue;
    }

    try {
      const embeddings: number[][] = [];
      for (let i = 0; i < extracted.chunks.length; i += embedBatch) {
        const batch = extracted.chunks.slice(i, i + embedBatch);
        const vecs = await embedDocuments(batch);
        embeddings.push(...vecs);
        if (i + embedBatch < extracted.chunks.length) {
          await sleep(delayMs);
        }
      }

      await withRagClient(async (client) => {
        await client.query("BEGIN");
        try {
          await upsertArticleWithEmbeddings(client, extracted, embeddings);
          await client.query("COMMIT");
        } catch (err) {
          await client.query("ROLLBACK");
          throw err;
        }
      });

      summary.upserted += 1;
      summary.chunks += extracted.chunks.length;
      if (extracted.chunks.length === 0) summary.skippedEmpty += 1;

      if (extracted.publishedAt) {
        const d = new Date(extracted.publishedAt);
        if (
          !Number.isNaN(d.getTime()) &&
          (!maxSuccessfulPublished || d > maxSuccessfulPublished)
        ) {
          maxSuccessfulPublished = d;
        }
      }
    } catch (err) {
      summary.errors += 1;
      const message =
        err instanceof VoyageEmbedError || err instanceof Error
          ? err.message
          : String(err);
      console.error(
        `[rag-sync] Artikel ${extracted.wepublishId} fehlgeschlagen: ${message}`,
      );
    }
  }

  // Advance only on successful upserts (lookback still re-covers same-day overlap).
  if (maxSuccessfulPublished) {
    await withRagClient((client) => writeCursor(client, maxSuccessfulPublished!));
    summary.cursorAdvancedTo = maxSuccessfulPublished.toISOString();
  }

  return summary;
}
