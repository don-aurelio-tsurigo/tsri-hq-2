-- CreateEnum
CREATE TYPE "Rating" AS ENUM ('POSITIVE', 'NEUTRAL', 'NEGATIVE');

-- CreateTable
CREATE TABLE "feedback_response" (
    "id" TEXT NOT NULL,
    "newsletter" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "issueDate" TEXT NOT NULL,
    "rating" "Rating" NOT NULL,
    "comment" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "commentAddedAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "feedback_response_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "feedback_response_newsletter_campaignId_idx" ON "feedback_response"("newsletter", "campaignId");
