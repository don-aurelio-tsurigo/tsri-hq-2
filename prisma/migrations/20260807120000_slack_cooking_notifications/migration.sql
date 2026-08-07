-- AlterTable
ALTER TABLE "organization" ADD COLUMN "slackCookingWeeklyEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "organization" ADD COLUMN "slackCookingMonthlyEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "organization" ADD COLUMN "slackCookingWeeklyLastKey" TEXT;
ALTER TABLE "organization" ADD COLUMN "slackCookingMonthlyLastKey" TEXT;
