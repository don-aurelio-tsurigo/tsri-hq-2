-- CreateEnum
CREATE TYPE "NewsletterSchedulingMode" AS ENUM ('newsletter', 'manualDates');

-- AlterEnum
ALTER TYPE "NewsletterCampaignStatus" ADD VALUE 'proposed';

-- AlterTable
ALTER TABLE "membership" ADD COLUMN "fixedDayOff" INTEGER;

-- AlterTable
ALTER TABLE "newsletter_type" ADD COLUMN "isNewsletter" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "newsletter_type" ADD COLUMN "isEveningShift" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "newsletter_type" ADD COLUMN "schedulingMode" "NewsletterSchedulingMode" NOT NULL DEFAULT 'newsletter';

-- CreateTable
CREATE TABLE "shift_quota" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "newsletterTypeId" TEXT NOT NULL,
    "minCount" INTEGER NOT NULL,
    "maxCount" INTEGER NOT NULL,
    "isFixed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shift_quota_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shift_quota_organizationId_idx" ON "shift_quota"("organizationId");

-- CreateIndex
CREATE INDEX "shift_quota_userId_idx" ON "shift_quota"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "shift_quota_organizationId_userId_newsletterTypeId_key" ON "shift_quota"("organizationId", "userId", "newsletterTypeId");

-- AddForeignKey
ALTER TABLE "shift_quota" ADD CONSTRAINT "shift_quota_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_quota" ADD CONSTRAINT "shift_quota_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_quota" ADD CONSTRAINT "shift_quota_newsletterTypeId_fkey" FOREIGN KEY ("newsletterTypeId") REFERENCES "newsletter_type"("id") ON DELETE CASCADE ON UPDATE CASCADE;
