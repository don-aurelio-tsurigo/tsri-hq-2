-- Drop legacy breakMinutes; pause becomes TimeSegment type=break
ALTER TABLE "time_entry" DROP COLUMN IF EXISTS "breakMinutes";

-- CreateEnum
CREATE TYPE "TimeSegmentType" AS ENUM ('work', 'break');

-- AlterTable
ALTER TABLE "time_segment" ADD COLUMN IF NOT EXISTS "type" "TimeSegmentType" NOT NULL DEFAULT 'work';
