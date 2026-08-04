-- AlterTable
ALTER TABLE "organization" ADD COLUMN "hideNewsletterHolidays" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "newsletter_blocked_range" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "newsletter_blocked_range_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "newsletter_blocked_range_organizationId_startDate_endDate_idx" ON "newsletter_blocked_range"("organizationId", "startDate", "endDate");

-- AddForeignKey
ALTER TABLE "newsletter_blocked_range" ADD CONSTRAINT "newsletter_blocked_range_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
