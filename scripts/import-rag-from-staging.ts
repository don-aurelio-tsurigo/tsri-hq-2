/**
 * Import RAG staging data (local pgvector DB) → HQ rag.* schema (e.g. Render).
 *
 * Source tables: articles_staging, article_chunks_staging (embedding_vec)
 * Target tables: rag.articles, rag.article_chunks
 *
 * Env:
 *   RAG_SOURCE_DATABASE_URL  local RAG prototype DB
 *   RAG_TARGET_DATABASE_URL  HQ DB (Render external URL with ?sslmode=require)
 *     fallback: DATABASE_URL
 *
 * Usage:
 *   RAG_SOURCE_DATABASE_URL=... RAG_TARGET_DATABASE_URL=... npm run db:import-rag
 *   npm run db:import-rag -- --dry-run
 *   npm run db:import-rag -- --batch-size=200
 */

import "dotenv/config";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

type CliArgs = {
  dryRun: boolean;
  batchSize: number;
  skipIndexDrop: boolean;
  help?: boolean;
};

const DEFAULT_BATCH = 100;

function loadDotEnvFile(filePath: string): void {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    dryRun: false,
    batchSize: DEFAULT_BATCH,
    skipIndexDrop: false,
  };
  for (const raw of argv) {
    if (raw === "--help" || raw === "-h") args.help = true;
    else if (raw === "--dry-run") args.dryRun = true;
    else if (raw === "--skip-index-drop") args.skipIndexDrop = true;
    else {
      const m = raw.match(/^--batch-size=(\d+)$/);
      if (m) args.batchSize = Number(m[1]);
    }
  }
  return args;
}

function printSection(title: string): void {
  console.log("\n" + "─".repeat(72));
  console.log(title);
  console.log("─".repeat(72));
}

function hostOf(url: string): string {
  try {
    const u = new URL(url.replace(/^postgres(ql)?:/, "http:"));
    return `${u.hostname}${u.pathname}`;
  } catch {
    return "(unparseable)";
  }
}

function poolOpts(connectionString: string): pg.PoolConfig {
  const isRemote = /render\.com/i.test(connectionString);
  return {
    connectionString,
    max: 2,
    ssl: isRemote ? { rejectUnauthorized: false } : undefined,
  };
}

async function main(): Promise<void> {
  // Prefer HQ .env; also accept source URL from sibling RAG_Import/.env as DATABASE_URL
  loadDotEnvFile(resolve(process.cwd(), ".env"));
  const ragImportEnv = resolve(
    "/Users/eliodonauer/Documents/Cursor/RAG_Import/.env"
  );
  if (!process.env.RAG_SOURCE_DATABASE_URL && existsSync(ragImportEnv)) {
    // Map RAG_Import DATABASE_URL → RAG_SOURCE_DATABASE_URL without overriding HQ DATABASE_URL
    const raw = readFileSync(ragImportEnv, "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("DATABASE_URL=")) continue;
      let value = trimmed.slice("DATABASE_URL=".length).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env.RAG_SOURCE_DATABASE_URL = value;
    }
  }

  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`Import local RAG staging → rag.* on target DB

Env:
  RAG_SOURCE_DATABASE_URL
  RAG_TARGET_DATABASE_URL (or DATABASE_URL)

Options:
  --dry-run
  --batch-size=N   (default ${DEFAULT_BATCH})
  --skip-index-drop
`);
    return;
  }

  const sourceUrl =
    process.env.RAG_SOURCE_DATABASE_URL?.trim() ||
    process.env.DATABASE_URL_RAG?.trim();
  const targetUrl =
    process.env.RAG_TARGET_DATABASE_URL?.trim() ||
    process.env.DATABASE_URL?.trim();

  if (!sourceUrl) {
    throw new Error(
      "RAG_SOURCE_DATABASE_URL fehlt (lokale RAG-DB, z.B. localhost:5433/rag_import)."
    );
  }
  if (!targetUrl) {
    throw new Error(
      "RAG_TARGET_DATABASE_URL oder DATABASE_URL fehlt (Ziel, z.B. Render + ?sslmode=require)."
    );
  }
  if (args.batchSize < 1) throw new Error("--batch-size muss >= 1 sein.");

  // Safety: refuse identical source/target hosts+db
  if (hostOf(sourceUrl) === hostOf(targetUrl)) {
    throw new Error(
      "Source und Target scheinen dieselbe DB zu sein — Abbruch."
    );
  }

  console.log("RAG Import (staging → rag.*)");
  console.log(`Source: ${hostOf(sourceUrl)}`);
  console.log(`Target: ${hostOf(targetUrl)}`);
  console.log(`Batch:  ${args.batchSize}${args.dryRun ? "  (dry-run)" : ""}`);

  const source = new pg.Pool(poolOpts(sourceUrl));
  const target = new pg.Pool(poolOpts(targetUrl));

  try {
    printSection("1. Counts");
    const srcCounts = await source.query<{
      articles: number;
      chunks: number;
      with_vec: number;
    }>(`
      SELECT
        (SELECT count(*)::int FROM articles_staging) AS articles,
        (SELECT count(*)::int FROM article_chunks_staging) AS chunks,
        (SELECT count(*)::int FROM article_chunks_staging WHERE embedding_vec IS NOT NULL) AS with_vec
    `);
    const s = srcCounts.rows[0]!;
    console.log(
      `Source: ${s.articles.toLocaleString("de-CH")} Artikel, ${s.chunks.toLocaleString("de-CH")} Chunks, ${s.with_vec.toLocaleString("de-CH")} mit embedding_vec`
    );
    if (s.chunks === 0) throw new Error("Source hat keine Chunks.");
    if (s.with_vec !== s.chunks) {
      console.warn(
        `Warnung: ${s.chunks - s.with_vec} Chunks ohne embedding_vec — werden mit NULL importiert.`
      );
    }

    const tgtBefore = await target.query<{
      articles: number;
      chunks: number;
    }>(`
      SELECT
        (SELECT count(*)::int FROM rag.articles) AS articles,
        (SELECT count(*)::int FROM rag.article_chunks) AS chunks
    `);
    console.log(
      `Target vorher: ${tgtBefore.rows[0]!.articles} Artikel, ${tgtBefore.rows[0]!.chunks} Chunks`
    );

    if (args.dryRun) {
      printSection("Dry-run — keine Schreibvorgänge");
      console.log(
        `Würde ${s.articles} Artikel + ${s.chunks} Chunks importieren (TRUNCATE + Insert, HNSW drop/recreate).`
      );
      return;
    }

    printSection("2. Target vorbereiten");
    await target.query("CREATE EXTENSION IF NOT EXISTS vector");
    if (!args.skipIndexDrop) {
      await target.query(
        `DROP INDEX IF EXISTS rag.article_chunks_embedding_vec_hnsw_idx`
      );
      console.log("HNSW-Index entfernt (schnellerer Bulk-Load)");
    }
    await target.query(
      `TRUNCATE TABLE rag.article_chunks, rag.articles RESTART IDENTITY CASCADE`
    );
    console.log("rag.articles / rag.article_chunks geleert");

    printSection("3. Artikel kopieren");
    let articlesCopied = 0;
    for (let offset = 0; ; offset += args.batchSize) {
      const batch = await source.query<{
        id: string;
        wepublish_id: string;
        slug: string | null;
        url: string | null;
        title: string | null;
        lead: string | null;
        published_at: Date | null;
        authors: unknown;
        tags: unknown;
        image_url: string | null;
        raw_word_count: number | null;
        updated_at: Date;
      }>(
        `
        SELECT
          id, wepublish_id, slug, url, title, lead, published_at,
          authors, tags, image_url, raw_word_count, updated_at
        FROM articles_staging
        ORDER BY published_at DESC NULLS LAST, id
        LIMIT $1 OFFSET $2
        `,
        [args.batchSize, offset]
      );
      if (batch.rows.length === 0) break;

      const client = await target.connect();
      try {
        await client.query("BEGIN");
        for (const row of batch.rows) {
          await client.query(
            `
            INSERT INTO rag.articles (
              id, wepublish_id, slug, url, title, lead, published_at,
              authors, tags, image_url, raw_word_count, updated_at
            ) VALUES (
              $1::uuid, $2, $3, $4, $5, $6, $7,
              $8::jsonb, $9::jsonb, $10, $11, $12
            )
            `,
            [
              row.id,
              row.wepublish_id,
              row.slug,
              row.url,
              row.title,
              row.lead,
              row.published_at,
              JSON.stringify(row.authors ?? []),
              JSON.stringify(row.tags ?? []),
              row.image_url,
              row.raw_word_count,
              row.updated_at,
            ]
          );
        }
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }

      articlesCopied += batch.rows.length;
      process.stdout.write(
        `\r  Artikel: ${articlesCopied.toLocaleString("de-CH")} / ${s.articles.toLocaleString("de-CH")}`
      );
    }
    console.log("");

    printSection("4. Chunks + Embeddings kopieren");
    let chunksCopied = 0;
    for (let offset = 0; ; offset += args.batchSize) {
      const batch = await source.query<{
        id: string;
        article_id: string;
        chunk_index: number;
        chunk_text: string;
        char_count: number | null;
        word_count: number | null;
        embedding_vec: string | null;
        updated_at: Date;
      }>(
        `
        SELECT
          id,
          article_id,
          chunk_index,
          chunk_text,
          char_count,
          word_count,
          embedding_vec::text AS embedding_vec,
          updated_at
        FROM article_chunks_staging
        ORDER BY article_id, chunk_index
        LIMIT $1 OFFSET $2
        `,
        [args.batchSize, offset]
      );
      if (batch.rows.length === 0) break;

      const client = await target.connect();
      try {
        await client.query("BEGIN");
        // Multi-row insert via unnest for speed
        const ids = batch.rows.map((r) => r.id);
        const articleIds = batch.rows.map((r) => r.article_id);
        const indexes = batch.rows.map((r) => r.chunk_index);
        const texts = batch.rows.map((r) => r.chunk_text);
        const chars = batch.rows.map((r) => r.char_count);
        const words = batch.rows.map((r) => r.word_count);
        const vecs = batch.rows.map((r) => r.embedding_vec);
        const updated = batch.rows.map((r) => r.updated_at);

        await client.query(
          `
          INSERT INTO rag.article_chunks (
            id, article_id, chunk_index, chunk_text,
            char_count, word_count, embedding_vec, updated_at
          )
          SELECT
            u.id::uuid,
            u.article_id::uuid,
            u.chunk_index,
            u.chunk_text,
            u.char_count,
            u.word_count,
            u.embedding_vec::vector,
            u.updated_at
          FROM unnest(
            $1::text[],
            $2::text[],
            $3::int[],
            $4::text[],
            $5::int[],
            $6::int[],
            $7::text[],
            $8::timestamptz[]
          ) AS u(
            id, article_id, chunk_index, chunk_text,
            char_count, word_count, embedding_vec, updated_at
          )
          `,
          [ids, articleIds, indexes, texts, chars, words, vecs, updated]
        );
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }

      chunksCopied += batch.rows.length;
      process.stdout.write(
        `\r  Chunks: ${chunksCopied.toLocaleString("de-CH")} / ${s.chunks.toLocaleString("de-CH")}`
      );
    }
    console.log("");

    printSection("5. HNSW-Index neu aufbauen");
    if (!args.skipIndexDrop) {
      const t0 = Date.now();
      await target.query(`
        CREATE INDEX article_chunks_embedding_vec_hnsw_idx
          ON rag.article_chunks
          USING hnsw (embedding_vec vector_cosine_ops)
          WITH (m = 16, ef_construction = 64)
      `);
      console.log(
        `HNSW erstellt in ${((Date.now() - t0) / 1000).toFixed(1)}s`
      );
    } else {
      console.log("Übersprungen (--skip-index-drop)");
    }

    printSection("6. Verify");
    const done = await target.query<{
      articles: number;
      chunks: number;
      with_vec: number;
    }>(`
      SELECT
        (SELECT count(*)::int FROM rag.articles) AS articles,
        (SELECT count(*)::int FROM rag.article_chunks) AS chunks,
        (SELECT count(*)::int FROM rag.article_chunks WHERE embedding_vec IS NOT NULL) AS with_vec
    `);
    const d = done.rows[0]!;
    console.log(
      `Target: ${d.articles.toLocaleString("de-CH")} Artikel, ${d.chunks.toLocaleString("de-CH")} Chunks, ${d.with_vec.toLocaleString("de-CH")} mit Vec`
    );

    const sample = await target.query<{
      title: string | null;
      authors: unknown;
    }>(`
      SELECT title, authors
      FROM rag.articles
      WHERE authors::text ILIKE '%Salamat%'
      ORDER BY published_at DESC NULLS LAST
      LIMIT 3
    `);
    console.log(`Sample Autor Salamat: ${sample.rows.length} Treffer`);
    for (const row of sample.rows) {
      console.log(`  - ${row.title}`);
    }

    if (d.articles !== s.articles || d.chunks !== s.chunks) {
      throw new Error(
        `Count-Mismatch Source(${s.articles}/${s.chunks}) vs Target(${d.articles}/${d.chunks})`
      );
    }
    if (d.with_vec !== s.with_vec) {
      throw new Error(
        `Embedding-Mismatch Source ${s.with_vec} vs Target ${d.with_vec}`
      );
    }

    printSection("Fertig");
  } finally {
    await source.end();
    await target.end();
  }
}

main().catch((err) => {
  console.error("\nAbbruch:");
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
