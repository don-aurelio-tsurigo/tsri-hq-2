-- Add per-newsletter-type blocked ranges (Sommerpause etc.)
ALTER TABLE "newsletter_blocked_range" ADD COLUMN IF NOT EXISTS "newsletterTypeId" TEXT;

-- Expand existing org-wide ranges onto every active type of that org
INSERT INTO "newsletter_blocked_range" (
  "id",
  "organizationId",
  "newsletterTypeId",
  "startDate",
  "endDate",
  "label",
  "createdAt",
  "updatedAt"
)
SELECT
  'nbr_' || replace(gen_random_uuid()::text, '-', ''),
  r."organizationId",
  t."id",
  r."startDate",
  r."endDate",
  r."label",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "newsletter_blocked_range" r
INNER JOIN "newsletter_type" t
  ON t."organizationId" = r."organizationId"
 AND t."active" = true
WHERE r."newsletterTypeId" IS NULL;

-- Drop legacy org-wide rows (now expanded) and orphans
DELETE FROM "newsletter_blocked_range" WHERE "newsletterTypeId" IS NULL;

ALTER TABLE "newsletter_blocked_range"
  ALTER COLUMN "newsletterTypeId" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "newsletter_blocked_range_newsletterTypeId_startDate_endDate_idx"
  ON "newsletter_blocked_range"("newsletterTypeId", "startDate", "endDate");

DO $$ BEGIN
  ALTER TABLE "newsletter_blocked_range"
    ADD CONSTRAINT "newsletter_blocked_range_newsletterTypeId_fkey"
    FOREIGN KEY ("newsletterTypeId") REFERENCES "newsletter_type"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
