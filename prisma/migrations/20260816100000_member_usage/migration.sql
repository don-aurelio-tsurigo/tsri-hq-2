-- Per-member rolling quotas for AI / RAG / image proxy

CREATE TYPE "MemberUsageKind" AS ENUM ('ai', 'rag_search', 'image_proxy');

CREATE TABLE "member_usage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "MemberUsageKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_usage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "member_usage_userId_kind_createdAt_idx" ON "member_usage"("userId", "kind", "createdAt");

ALTER TABLE "member_usage" ADD CONSTRAINT "member_usage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
