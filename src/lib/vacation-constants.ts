import type { VacationStatus } from "@/generated/prisma/client";

export const VACATION_STATUS_LABELS: Record<VacationStatus, string> = {
  pending: "Offen",
  approved: "Genehmigt",
  rejected: "Abgelehnt",
};

export function toVacationDateKey(date: Date | string) {
  if (typeof date === "string") return date.slice(0, 10);
  return date.toISOString().slice(0, 10);
}
