-- Cursor for incremental WePublish → rag.* sync (in-process on HQ / Render)

CREATE TABLE IF NOT EXISTS "rag"."sync_state" (
    "key" TEXT NOT NULL,
    "value_timestamptz" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_state_pkey" PRIMARY KEY ("key")
);
