-- AlterTable (idempotent: build may already have applied this via db push)
ALTER TABLE "carousel_post" ADD COLUMN IF NOT EXISTS "sourcePreTitle" TEXT;
