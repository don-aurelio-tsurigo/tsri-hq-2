-- CreateTable
CREATE TABLE "article_category" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#e5e7eb',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "article_category_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "article_category_organizationId_sortOrder_idx" ON "article_category"("organizationId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "article_category_organizationId_name_key" ON "article_category"("organizationId", "name");

-- AddForeignKey
ALTER TABLE "article_category" ADD CONSTRAINT "article_category_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed default categories per organization (legacy enum → display names)
INSERT INTO "article_category" ("id", "organizationId", "name", "color", "sortOrder", "active", "createdAt", "updatedAt")
SELECT
  md5(o.id || ':' || d.legacy_key),
  o.id,
  d.name,
  d.color,
  d.sort_order,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "organization" o
CROSS JOIN (
  VALUES
    ('nuetzliches', 'Nützliches', '#d4edc0', 0),
    ('leicht_und_seicht', 'Leicht und seicht', '#f5d9b8', 1),
    ('persoenliche_perspektive', 'Persönl. Perspektive', '#ddd0f5', 2),
    ('groesseres_ganzes', 'Grösseres Ganzes', '#c5dff5', 3),
    ('aha_perspektive', 'Aha Perspektive', '#f0d9b8', 4)
) AS d(legacy_key, name, color, sort_order);

-- AlterTable: add new FK column
ALTER TABLE "task" ADD COLUMN "categoryId" TEXT;

-- Migrate existing enum values onto the new category rows
UPDATE "task" t
SET "categoryId" = ac.id
FROM "space" s
JOIN "article_category" ac ON ac."organizationId" = s."organizationId"
WHERE t."spaceId" = s.id
  AND t.category IS NOT NULL
  AND (
    (t.category = 'nuetzliches' AND ac.name = 'Nützliches')
    OR (t.category = 'leicht_und_seicht' AND ac.name = 'Leicht und seicht')
    OR (t.category = 'persoenliche_perspektive' AND ac.name = 'Persönl. Perspektive')
    OR (t.category = 'groesseres_ganzes' AND ac.name = 'Grösseres Ganzes')
    OR (t.category = 'aha_perspektive' AND ac.name = 'Aha Perspektive')
  );

-- DropIndex
DROP INDEX IF EXISTS "task_category_idx";

-- AlterTable: drop old enum column
ALTER TABLE "task" DROP COLUMN "category";

-- CreateIndex
CREATE INDEX "task_categoryId_idx" ON "task"("categoryId");

-- AddForeignKey
ALTER TABLE "task" ADD CONSTRAINT "task_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "article_category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- DropEnum
DROP TYPE "ArticleCategory";
