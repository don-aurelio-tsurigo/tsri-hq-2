import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";

/** Calendar-day offset: negative = before event. */
export function dueAtFromEvent(
  eventAt: Date | string,
  dueOffsetDays: number | null | undefined,
): Date | null {
  if (dueOffsetDays == null) return null;
  const base =
    typeof eventAt === "string" ? parseISO(eventAt.slice(0, 10)) : eventAt;
  return addDays(base, dueOffsetDays);
}

export function offsetFromEvent(
  eventAt: Date | string,
  dueAt: Date | string,
): number {
  const event =
    typeof eventAt === "string" ? parseISO(eventAt.slice(0, 10)) : eventAt;
  const due =
    typeof dueAt === "string" ? parseISO(String(dueAt).slice(0, 10)) : dueAt;
  return differenceInCalendarDays(due, event);
}

export function toDateInputValue(value: Date | string | null | undefined) {
  if (!value) return "";
  if (typeof value === "string") return value.slice(0, 10);
  return format(value, "yyyy-MM-dd");
}
