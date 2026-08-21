-- Monthly DAM archive review cutoff. Sentinel row keeps the existing catalog out of the first queue.
CREATE TABLE "dam_archive_review" (
    "id" TEXT NOT NULL,
    "reviewedUntil" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedBy" TEXT,
    "remainingCount" INTEGER NOT NULL,

    CONSTRAINT "dam_archive_review_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "dam_archive_review_completedAt_idx" ON "dam_archive_review"("completedAt");

ALTER TABLE "dam_archive_review" ADD CONSTRAINT "dam_archive_review_completedBy_fkey" FOREIGN KEY ("completedBy") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "dam_archive_review" ("id", "reviewedUntil", "completedAt", "remainingCount")
VALUES ('sentinel', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0);
