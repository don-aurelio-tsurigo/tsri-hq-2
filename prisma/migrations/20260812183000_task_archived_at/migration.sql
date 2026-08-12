-- Soft-delete for tasks (archivedAt); no hard-delete path
ALTER TABLE "task" ADD COLUMN "archivedAt" TIMESTAMP(3);

CREATE INDEX "task_spaceId_archivedAt_idx" ON "task"("spaceId", "archivedAt");
