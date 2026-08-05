-- Fix missing time_segment table (schema already expects segments; DB was never migrated).
-- Migrate legacy flat columns into segments, then drop them.

DO $$ BEGIN
  CREATE TYPE "TimeSegmentType" AS ENUM ('work', 'break');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "time_segment" (
    "id" TEXT NOT NULL,
    "timeEntryId" TEXT NOT NULL,
    "type" "TimeSegmentType" NOT NULL DEFAULT 'work',
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "time_segment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "time_segment_timeEntryId_sortOrder_idx"
  ON "time_segment"("timeEntryId", "sortOrder");

DO $$ BEGIN
  ALTER TABLE "time_segment"
    ADD CONSTRAINT "time_segment_timeEntryId_fkey"
    FOREIGN KEY ("timeEntryId") REFERENCES "time_entry"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Migrate closed work intervals + optional pause from legacy columns
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'time_entry' AND column_name = 'startTime'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'time_entry' AND column_name = 'endTime'
  ) THEN
    INSERT INTO "time_segment" ("id", "timeEntryId", "type", "startTime", "endTime", "sortOrder")
    SELECT
      'mig_' || te."id" || '_w0',
      te."id",
      'work'::"TimeSegmentType",
      te."startTime",
      te."endTime",
      0
    FROM "time_entry" te
    WHERE te."type" = 'work'
      AND te."startTime" IS NOT NULL
      AND te."endTime" IS NOT NULL
      AND te."startTime" <> ''
      AND te."endTime" <> ''
      AND NOT EXISTS (
        SELECT 1 FROM "time_segment" ts WHERE ts."timeEntryId" = te."id"
      );

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'time_entry' AND column_name = 'breakMinutes'
    ) THEN
      INSERT INTO "time_segment" ("id", "timeEntryId", "type", "startTime", "endTime", "sortOrder")
      SELECT
        'mig_' || te."id" || '_b0',
        te."id",
        'break'::"TimeSegmentType",
        te."startTime",
        to_char(
          (to_timestamp(te."startTime", 'HH24:MI') + make_interval(mins => te."breakMinutes"))::time,
          'HH24:MI'
        ),
        1
      FROM "time_entry" te
      WHERE te."type" = 'work'
        AND te."breakMinutes" IS NOT NULL
        AND te."breakMinutes" > 0
        AND te."startTime" IS NOT NULL
        AND te."startTime" <> ''
        AND NOT EXISTS (
          SELECT 1 FROM "time_segment" ts
          WHERE ts."timeEntryId" = te."id" AND ts."type" = 'break'
        );
    END IF;
  END IF;
END $$;

ALTER TABLE "time_entry" DROP COLUMN IF EXISTS "startTime";
ALTER TABLE "time_entry" DROP COLUMN IF EXISTS "endTime";
ALTER TABLE "time_entry" DROP COLUMN IF EXISTS "breakMinutes";
