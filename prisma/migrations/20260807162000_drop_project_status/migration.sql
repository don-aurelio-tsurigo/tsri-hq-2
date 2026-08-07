-- AlterTable
ALTER TABLE "space" DROP COLUMN IF EXISTS "projectStatus";

-- DropEnum
DROP TYPE IF EXISTS "ProjectStatus";
