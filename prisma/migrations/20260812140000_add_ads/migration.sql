-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('ACTIVE', 'PAUSED');

-- CreateEnum
CREATE TYPE "CreativeType" AS ENUM ('IMAGE', 'VIDEO');

-- CreateEnum
CREATE TYPE "AdEventType" AS ENUM ('IMPRESSION', 'CLICK');

-- CreateTable
CREATE TABLE "campaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "creative" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "type" "CreativeType" NOT NULL,
    "mediaUrl" TEXT NOT NULL,
    "targetUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "creative_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_event" (
    "id" TEXT NOT NULL,
    "creativeId" TEXT NOT NULL,
    "type" "AdEventType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ad_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "campaign_status_startDate_endDate_idx" ON "campaign"("status", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "creative_campaignId_idx" ON "creative"("campaignId");

-- CreateIndex
CREATE INDEX "ad_event_creativeId_type_idx" ON "ad_event"("creativeId", "type");

-- AddForeignKey
ALTER TABLE "creative" ADD CONSTRAINT "creative_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_event" ADD CONSTRAINT "ad_event_creativeId_fkey" FOREIGN KEY ("creativeId") REFERENCES "creative"("id") ON DELETE CASCADE ON UPDATE CASCADE;
