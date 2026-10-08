import type { TaskStatus } from "@/generated/prisma/client";

/** Client-safe (no database imports). */
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "Offen",
  doing: "In Arbeit",
  done: "Erledigt",
  cancelled: "Abgebrochen",
};
