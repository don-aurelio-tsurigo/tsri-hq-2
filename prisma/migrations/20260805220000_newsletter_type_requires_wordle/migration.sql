-- Optional Wordle field per newsletter type
ALTER TABLE "newsletter_type" ADD COLUMN IF NOT EXISTS "requiresWordle" BOOLEAN NOT NULL DEFAULT false;
