-- CreateEnum
CREATE TYPE "NewsItemStatus" AS ENUM ('neu', 'interessant', 'beobachten', 'verworfen');

-- CreateTable
CREATE TABLE "news_item" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceLabel" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "link" TEXT NOT NULL,
    "summary" TEXT,
    "publishedAt" TIMESTAMP(3),
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "status" "NewsItemStatus" NOT NULL DEFAULT 'neu',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "news_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "news_item_organizationId_status_idx" ON "news_item"("organizationId", "status");

-- CreateIndex
CREATE INDEX "news_item_organizationId_source_idx" ON "news_item"("organizationId", "source");

-- CreateIndex
CREATE INDEX "news_item_organizationId_publishedAt_idx" ON "news_item"("organizationId", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "news_item_organizationId_externalId_key" ON "news_item"("organizationId", "externalId");

-- AddForeignKey
ALTER TABLE "news_item" ADD CONSTRAINT "news_item_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
