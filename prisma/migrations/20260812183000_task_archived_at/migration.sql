-- Soft-delete for tasks (archivedAt); no hard-delete path
-- Idempotent: prod may already have the column from an earlier db push
ALTER TABLE "task" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "task_spaceId_archivedAt_idx" ON "task"("spaceId", "archivedAt");
