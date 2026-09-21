-- AlterTable
ALTER TABLE "public"."membership" ADD COLUMN "eveningBlockedWeekdays" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];
