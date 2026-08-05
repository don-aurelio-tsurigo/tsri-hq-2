-- CreateTable
CREATE TABLE "time_segment" (
    "id" TEXT NOT NULL,
    "timeEntryId" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "time_segment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "time_segment_timeEntryId_sortOrder_idx" ON "time_segment"("timeEntryId", "sortOrder");

-- AddForeignKey
ALTER TABLE "time_segment" ADD CONSTRAINT "time_segment_timeEntryId_fkey" FOREIGN KEY ("timeEntryId") REFERENCES "time_entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "time_entry" DROP COLUMN IF EXISTS "startTime",
DROP COLUMN IF EXISTS "endTime",
DROP COLUMN IF EXISTS "breakMinutes";
