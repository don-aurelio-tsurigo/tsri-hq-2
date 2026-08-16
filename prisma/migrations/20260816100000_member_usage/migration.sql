-- Per-member rolling quotas for AI / RAG / image proxy
-- Idempotent: safe to re-run after a partial apply (e.g. type already exists).

DO $$ BEGIN
    CREATE TYPE "MemberUsageKind" AS ENUM ('ai', 'rag_search', 'image_proxy');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "member_usage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "MemberUsageKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_usage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "member_usage_userId_kind_createdAt_idx"
    ON "member_usage"("userId", "kind", "createdAt");

DO $$ BEGIN
    ALTER TABLE "member_usage"
        ADD CONSTRAINT "member_usage_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "user"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
