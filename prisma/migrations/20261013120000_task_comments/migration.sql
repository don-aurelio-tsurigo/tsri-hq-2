-- Tasks: Kommentare

CREATE TABLE "task_comment" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_comment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "task_comment_taskId_createdAt_idx" ON "task_comment"("taskId", "createdAt");
CREATE INDEX "task_comment_authorId_idx" ON "task_comment"("authorId");

ALTER TABLE "task_comment" ADD CONSTRAINT "task_comment_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_comment" ADD CONSTRAINT "task_comment_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
