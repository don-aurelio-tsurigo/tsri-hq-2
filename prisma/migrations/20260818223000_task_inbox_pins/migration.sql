-- Pins for personal task lists and project task buckets in the sidebar.
CREATE TYPE "TaskInboxPinKind" AS ENUM ('list', 'project');

CREATE TABLE "task_inbox_pin" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "TaskInboxPinKind" NOT NULL,
    "targetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_inbox_pin_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "task_inbox_pin_userId_idx" ON "task_inbox_pin"("userId");

CREATE UNIQUE INDEX "task_inbox_pin_userId_kind_targetId_key" ON "task_inbox_pin"("userId", "kind", "targetId");

ALTER TABLE "task_inbox_pin" ADD CONSTRAINT "task_inbox_pin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
