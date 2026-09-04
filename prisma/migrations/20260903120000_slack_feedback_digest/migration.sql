-- AlterTable
ALTER TABLE "organization" ADD COLUMN "slackFeedbackDigestEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "organization" ADD COLUMN "slackFeedbackDigestWebhookUrl" TEXT;
ALTER TABLE "organization" ADD COLUMN "slackFeedbackDigestLastKey" TEXT;
