-- Redaktion: Kommentare zu Artikeln

CREATE TABLE "article_comment" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "article_comment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "article_comment_articleId_createdAt_idx" ON "article_comment"("articleId", "createdAt");
CREATE INDEX "article_comment_authorId_idx" ON "article_comment"("authorId");

ALTER TABLE "article_comment" ADD CONSTRAINT "article_comment_articleId_fkey"
  FOREIGN KEY ("articleId") REFERENCES "article"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "article_comment" ADD CONSTRAINT "article_comment_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
