-- AlterTable (idempotent: build may already have applied this via db push)
ALTER TABLE "carousel_post" ADD COLUMN IF NOT EXISTS "format" TEXT NOT NULL DEFAULT 'auto';
