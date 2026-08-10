-- RAG archive (pgvector) in dedicated schema "rag"
-- NOTE: Prisma does not fully manage vector(N) / HNSW; this migration is hand-tuned.
-- If `prisma migrate diff` ever rewrites this, keep:
--   CREATE EXTENSION vector
--   embedding_vec vector(1024)  (with dimensions)
--   HNSW index with vector_cosine_ops

-- Extension is DB-wide (objects typically install into public)
CREATE EXTENSION IF NOT EXISTS vector;

CREATE SCHEMA IF NOT EXISTS rag;

-- CreateTable
CREATE TABLE "rag"."articles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "wepublish_id" TEXT NOT NULL,
    "slug" TEXT,
    "url" TEXT,
    "title" TEXT,
    "lead" TEXT,
    "published_at" TIMESTAMPTZ(6),
    "authors" JSONB,
    "tags" JSONB,
    "image_url" TEXT,
    "raw_word_count" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rag"."article_chunks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "article_id" UUID NOT NULL,
    "chunk_index" INTEGER NOT NULL,
    "chunk_text" TEXT NOT NULL,
    "char_count" INTEGER,
    "word_count" INTEGER,
    "embedding_vec" vector(1024),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "article_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "articles_wepublish_id_key" ON "rag"."articles"("wepublish_id");

-- CreateIndex
CREATE INDEX "article_chunks_article_id_idx" ON "rag"."article_chunks"("article_id");

-- CreateIndex
CREATE UNIQUE INDEX "article_chunks_article_id_chunk_index_key" ON "rag"."article_chunks"("article_id", "chunk_index");

-- AddForeignKey
ALTER TABLE "rag"."article_chunks"
  ADD CONSTRAINT "article_chunks_article_id_fkey"
  FOREIGN KEY ("article_id") REFERENCES "rag"."articles"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- HNSW cosine index (prototype: m=16, ef_construction=64)
CREATE INDEX "article_chunks_embedding_vec_hnsw_idx"
  ON "rag"."article_chunks"
  USING hnsw ("embedding_vec" vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
