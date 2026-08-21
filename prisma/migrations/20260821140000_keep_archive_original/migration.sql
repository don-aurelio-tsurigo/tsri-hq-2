-- Existing archive masters were baked with editParams. Treat those files as the
-- new original and drop leftover recipes so CSS/export would not apply them twice.
UPDATE "asset"
SET "editParams" = NULL
WHERE status = 'published' AND "editParams" IS NOT NULL;
