-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('idea', 'planning', 'live', 'done');

-- AlterTable
ALTER TABLE "space" ADD COLUMN "eventAt" DATE,
ADD COLUMN "venue" TEXT,
ADD COLUMN "projectStatus" "ProjectStatus";

-- AlterTable
ALTER TABLE "task" ADD COLUMN "dueOffsetDays" INTEGER;
