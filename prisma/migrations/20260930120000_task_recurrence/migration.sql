-- Wiederkehrende Tasks: Regel + Verweis auf den Vorgänger der Serie
-- Idempotent und rein additiv (nullable Spalten), alter Code läuft weiter
ALTER TABLE "task" ADD COLUMN IF NOT EXISTS "recurrence" JSONB;
ALTER TABLE "task" ADD COLUMN IF NOT EXISTS "recurrenceFromId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "task_recurrenceFromId_key" ON "task"("recurrenceFromId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'task_recurrenceFromId_fkey'
  ) THEN
    ALTER TABLE "task" ADD CONSTRAINT "task_recurrenceFromId_fkey"
      FOREIGN KEY ("recurrenceFromId") REFERENCES "task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
