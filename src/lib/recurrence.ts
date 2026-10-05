import { z } from "zod";

/**
 * Wiederholungsregel für Tasks (gespeichert als JSON in task.recurrence).
 * - freq/interval: alle N Tage/Wochen/Monate/Jahre
 * - weekdays: nur bei "weekly" mit interval 1 (0 = So … 6 = Sa)
 * - anchor: "due" = ab bisherigem Fälligkeitsdatum, "done" = ab Erledigt-Datum
 */
export const recurrenceSchema = z.object({
  freq: z.enum(["daily", "weekly", "monthly", "yearly"]),
  interval: z.number().int().min(1).max(365),
  weekdays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  anchor: z.enum(["due", "done"]),
});

export type Recurrence = z.infer<typeof recurrenceSchema>;

export function parseRecurrence(value: unknown): Recurrence | null {
  if (value == null) return null;
  const raw = typeof value === "string" ? safeJson(value) : value;
  const parsed = recurrenceSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

const TIME_ZONE = "Europe/Zurich";

/** Heutiges Datum in Zürich als UTC-Mitternacht (wie dueAt aus "yyyy-MM-dd"). */
export function todayUtcDate(now = new Date()): Date {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(
    now,
  );
  return new Date(`${ymd}T00:00:00.000Z`);
}

function utcDate(y: number, m: number, d: number) {
  return new Date(Date.UTC(y, m, d));
}

function daysInMonth(y: number, m: number) {
  return new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
}

function step(rule: Recurrence, from: Date): Date {
  const y = from.getUTCFullYear();
  const m = from.getUTCMonth();
  const d = from.getUTCDate();

  switch (rule.freq) {
    case "daily":
      return utcDate(y, m, d + rule.interval);
    case "weekly": {
      const days = rule.weekdays?.length ? [...rule.weekdays].sort() : null;
      if (!days || rule.interval !== 1) {
        return utcDate(y, m, d + 7 * rule.interval);
      }
      for (let i = 1; i <= 7; i++) {
        const next = utcDate(y, m, d + i);
        if (days.includes(next.getUTCDay())) return next;
      }
      return utcDate(y, m, d + 7);
    }
    case "monthly": {
      const target = m + rule.interval;
      const ty = y + Math.floor(target / 12);
      const tm = ((target % 12) + 12) % 12;
      return utcDate(ty, tm, Math.min(d, daysInMonth(ty, tm)));
    }
    case "yearly": {
      const ty = y + rule.interval;
      return utcDate(ty, m, Math.min(d, daysInMonth(ty, m)));
    }
  }
}

/**
 * Nächstes Fälligkeitsdatum. Liegt es (bei anchor "due") noch in der
 * Vergangenheit, wird weitergerechnet, bis es nach heute liegt.
 */
export function nextDueAt(
  rule: Recurrence,
  currentDueAt: Date | null,
  now = new Date(),
): Date {
  const today = todayUtcDate(now);
  const base =
    rule.anchor === "done" || !currentDueAt
      ? today
      : utcDate(
          currentDueAt.getUTCFullYear(),
          currentDueAt.getUTCMonth(),
          currentDueAt.getUTCDate(),
        );

  let next = step(rule, base);
  for (let i = 0; next <= today && i < 1000; i++) {
    next = step(rule, next);
  }
  return next;
}

export const RECURRENCE_PRESETS: {
  key: string;
  label: string;
  rule: Omit<Recurrence, "anchor">;
}[] = [
  { key: "daily", label: "Täglich", rule: { freq: "daily", interval: 1 } },
  {
    key: "workdays",
    label: "Werktags (Mo–Fr)",
    rule: { freq: "weekly", interval: 1, weekdays: [1, 2, 3, 4, 5] },
  },
  { key: "weekly", label: "Wöchentlich", rule: { freq: "weekly", interval: 1 } },
  {
    key: "biweekly",
    label: "Alle 2 Wochen",
    rule: { freq: "weekly", interval: 2 },
  },
  { key: "monthly", label: "Monatlich", rule: { freq: "monthly", interval: 1 } },
  { key: "yearly", label: "Jährlich", rule: { freq: "yearly", interval: 1 } },
];

/** Key der passenden Vorgabe; "" = keine, "custom" = eigene Regel. */
export function recurrencePresetKey(rule: Recurrence | null): string {
  if (!rule) return "";
  const match = RECURRENCE_PRESETS.find(
    (p) =>
      p.rule.freq === rule.freq &&
      p.rule.interval === rule.interval &&
      (p.rule.weekdays ?? []).join() === (rule.weekdays ?? []).join(),
  );
  return match?.key ?? "custom";
}

const WEEKDAY_SHORT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

export function recurrenceLabel(rule: Recurrence): string {
  const n = rule.interval;
  let label: string;
  switch (rule.freq) {
    case "daily":
      label = n === 1 ? "Täglich" : `Alle ${n} Tage`;
      break;
    case "weekly": {
      const days = rule.weekdays ?? [];
      const workdays = [1, 2, 3, 4, 5];
      if (
        n === 1 &&
        days.length === 5 &&
        workdays.every((d) => days.includes(d))
      ) {
        label = "Werktags";
      } else if (n === 1 && days.length > 0) {
        const ordered = [1, 2, 3, 4, 5, 6, 0].filter((d) => days.includes(d));
        label = `Wöchentlich (${ordered.map((d) => WEEKDAY_SHORT[d]).join(", ")})`;
      } else {
        label = n === 1 ? "Wöchentlich" : `Alle ${n} Wochen`;
      }
      break;
    }
    case "monthly":
      label = n === 1 ? "Monatlich" : `Alle ${n} Monate`;
      break;
    case "yearly":
      label = n === 1 ? "Jährlich" : `Alle ${n} Jahre`;
      break;
  }
  return rule.anchor === "done" ? `${label} ab Erledigung` : label;
}
