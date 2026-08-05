-- Restore explicit break on TimeEntry; require closed segments
ALTER TABLE "time_entry" ADD COLUMN IF NOT EXISTS "breakMinutes" INTEGER NOT NULL DEFAULT 0;

-- Delete any open/incomplete segments before enforcing NOT NULL
DELETE FROM "time_segment" WHERE "endTime" IS NULL;

ALTER TABLE "time_segment" ALTER COLUMN "endTime" SET NOT NULL;
