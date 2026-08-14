UPDATE "carousel_post" SET "format" = 'standard' WHERE "format" = 'auto';
ALTER TABLE "carousel_post" ALTER COLUMN "format" SET DEFAULT 'standard';
