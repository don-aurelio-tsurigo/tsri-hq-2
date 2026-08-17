import {
  addDays,
  differenceInCalendarDays,
  format,
  parseISO,
  startOfDay,
} from "date-fns";

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

export function isProjectEvent(eventAt: Date | string | null | undefined) {
  return eventAt != null && eventAt !== "";
}

export function eventCountdownLabel(eventAt: Date | string | null | undefined) {
  if (!eventAt) return null;
  const event =
    typeof eventAt === "string"
      ? startOfDay(parseISO(eventAt.slice(0, 10)))
      : startOfDay(eventAt);
  const today = startOfDay(new Date());
  const days = differenceInCalendarDays(event, today);
  if (days === 0) return "Heute";
  if (days === 1) return "Morgen";
  if (days === -1) return "Gestern";
  if (days > 1) return `in ${days} Tagen`;
  return `vor ${Math.abs(days)} Tagen`;
}
