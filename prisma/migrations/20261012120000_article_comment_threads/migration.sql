-- Redaktion: Kommentare zu Textstellen (Threads mit Antworten, erledigt-Status)

ALTER TABLE "article_comment" ADD COLUMN "parentId" TEXT;
ALTER TABLE "article_comment" ADD COLUMN "quote" TEXT;
ALTER TABLE "article_comment" ADD COLUMN "resolvedAt" TIMESTAMP(3);

CREATE INDEX "article_comment_parentId_idx" ON "article_comment"("parentId");

ALTER TABLE "article_comment" ADD CONSTRAINT "article_comment_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "article_comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
