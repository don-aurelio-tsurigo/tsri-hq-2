import { format, getISOWeek, getISOWeekYear } from "date-fns";
import { de } from "date-fns/locale";
import { cookingDatesForWeek } from "@/lib/cooking";

export type CookingDigestSlot = {
  date: Date;
  user: { name: string };
};

function appBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    process.env.BETTER_AUTH_URL?.replace(/\/$/, "") ||
    "http://localhost:3000"
  );
}

export function kochplanSpaceUrl(spaceId: string) {
  return `${appBaseUrl()}/spaces/${spaceId}`;
}

/** Build Slack text for Mon digest covering Tue–Fri of `weekMonday`. */
export function buildWeeklyCookingDigestText(opts: {
  weekMonday: Date;
  slots: CookingDigestSlot[];
  spaceId: string;
}) {
  const byKey = new Map(
    opts.slots.map((s) => [s.date.toISOString().slice(0, 10), s.user.name]),
  );
  const days = cookingDatesForWeek(opts.weekMonday);
  const lines = days.map((date) => {
    const key = date.toISOString().slice(0, 10);
    const label = format(date, "EEE d.M.", { locale: de });
    const cook = byKey.get(key);
    return cook ? `• ${label} — ${cook}` : `• ${label} — _offen_`;
  });

  const weekLabel = format(opts.weekMonday, "d. MMMM yyyy", { locale: de });
  return [
    `*Kochplan — Woche ab ${weekLabel}*`,
    "",
    ...lines,
    "",
    `<${kochplanSpaceUrl(opts.spaceId)}|Im Kochplan öffnen>`,
  ].join("\n");
}

/** Reminder to sign up for next calendar month. */
export function buildMonthlyCookingReminderText(opts: {
  targetYear: number;
  targetMonth: number; // 1–12
  spaceId: string;
}) {
  const anchor = new Date(
    Date.UTC(opts.targetYear, opts.targetMonth - 1, 1, 12),
  );
  const monthLabel = format(anchor, "MMMM yyyy", { locale: de });
  return [
    `*Kochplan — Eintragen für ${monthLabel}*`,
    "",
    `Bitte tragt eure Kochtage für ${monthLabel} im Kochplan ein.`,
    "",
    `<${kochplanSpaceUrl(opts.spaceId)}|Im Kochplan öffnen>`,
  ].join("\n");
}

export function isoWeekKeyFromDate(date: Date) {
  const year = getISOWeekYear(date);
  const week = String(getISOWeek(date)).padStart(2, "0");
  return `${year}-W${week}`;
}

export function monthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}
