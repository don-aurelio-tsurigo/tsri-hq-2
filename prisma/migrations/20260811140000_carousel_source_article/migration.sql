-- AlterTable (idempotent: build may already have applied these via db push)
ALTER TABLE "carousel_post" ADD COLUMN IF NOT EXISTS "sourceUrl" TEXT;
ALTER TABLE "carousel_post" ADD COLUMN IF NOT EXISTS "sourceTitle" TEXT;
ALTER TABLE "carousel_post" ADD COLUMN IF NOT EXISTS "sourceLead" TEXT;
ALTER TABLE "carousel_post" ADD COLUMN IF NOT EXISTS "sourceBody" TEXT;
