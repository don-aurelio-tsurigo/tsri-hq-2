import { addMonths, endOfMonth, startOfWeek } from "date-fns";
import {
  cookingDatesForWeek,
  getKochplanSpaceId,
  listCookingSlots,
  toDateKey,
} from "@/lib/cooking";
import { prisma } from "@/lib/db";
import {
  buildMonthlyCookingReminderText,
  buildWeeklyCookingDigestText,
  isoWeekKeyFromDate,
  monthKey,
} from "@/lib/notifications/cooking-messages";
import { postToSlack } from "@/lib/notifications/slack";

const TZ = "Europe/Zurich";
const SEND_FROM_HOUR = 8;

export type ZurichClock = {
  year: number;
  month: number;
  day: number;
  hour: number;
  weekdayShort: string; // Mon … Sun (en-GB)
  /** Calendar date in Zurich as local-noon UTC Date (yyyy-mm-dd semantics). */
  calendarDate: Date;
};

export function getZurichClock(now: Date = new Date()): ZurichClock {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>;

  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const hour = Number(parts.hour);
  const weekdayShort = parts.weekday;

  return {
    year,
    month,
    day,
    hour,
    weekdayShort,
    calendarDate: new Date(Date.UTC(year, month - 1, day, 12)),
  };
}

function isMondayMorningOrLater(clock: ZurichClock) {
  return clock.weekdayShort === "Mon" && clock.hour >= SEND_FROM_HOUR;
}

/** Monday of the calendar week that contains the last day of `clock`'s month. */
export function lastWeekMondayOfMonth(clock: ZurichClock) {
  const monthEnd = endOfMonth(clock.calendarDate);
  return startOfWeek(monthEnd, { weekStartsOn: 1 });
}

export function isLastWeekMondayOfMonth(clock: ZurichClock) {
  if (!isMondayMorningOrLater(clock)) return false;
  const lastMonday = lastWeekMondayOfMonth(clock);
  return toDateKey(lastMonday) === toDateKey(clock.calendarDate);
}

export async function runSlackCookingNotificationsForAllOrgs(
  now: Date = new Date(),
) {
  const clock = getZurichClock(now);
  const summary = {
    orgs: 0,
    weeklySent: 0,
    monthlySent: 0,
    skipped: 0,
    errors: 0,
  };

  if (!isMondayMorningOrLater(clock)) {
    return summary;
  }

  const orgs = await prisma.organization.findMany({
    select: {
      id: true,
      slackCookingWeeklyEnabled: true,
      slackCookingMonthlyEnabled: true,
      slackCookingWeeklyWebhookUrl: true,
      slackCookingMonthlyWebhookUrl: true,
      slackCookingWeeklyLastKey: true,
      slackCookingMonthlyLastKey: true,
    },
  });
  summary.orgs = orgs.length;

  const weekKey = isoWeekKeyFromDate(clock.calendarDate);
  const weekMonday = startOfWeek(clock.calendarDate, { weekStartsOn: 1 });
  const nextMonthAnchor = addMonths(
    new Date(Date.UTC(clock.year, clock.month - 1, 1, 12)),
    1,
  );
  const nextMonthKey = monthKey(
    nextMonthAnchor.getUTCFullYear(),
    nextMonthAnchor.getUTCMonth() + 1,
  );
  const sendMonthly = isLastWeekMondayOfMonth(clock);

  for (const org of orgs) {
    const spaceId = await getKochplanSpaceId(org.id);
    if (!spaceId) {
      summary.skipped += 1;
      continue;
    }

    if (
      org.slackCookingWeeklyEnabled &&
      org.slackCookingWeeklyLastKey !== weekKey
    ) {
      const cookingDays = cookingDatesForWeek(weekMonday);
      const from = new Date(`${toDateKey(cookingDays[0]!)}T12:00:00.000Z`);
      const to = new Date(`${toDateKey(cookingDays[3]!)}T12:00:00.000Z`);
      const slots = await listCookingSlots(spaceId, from, to);
      const text = buildWeeklyCookingDigestText({
        weekMonday,
        slots,
        spaceId,
      });
      const result = await postToSlack(text, org.slackCookingWeeklyWebhookUrl);
      if (result.ok && !result.skipped) {
        await prisma.organization.update({
          where: { id: org.id },
          data: { slackCookingWeeklyLastKey: weekKey },
        });
        summary.weeklySent += 1;
      } else if (!result.ok) {
        summary.errors += 1;
      } else {
        summary.skipped += 1;
      }
    }

    if (
      sendMonthly &&
      org.slackCookingMonthlyEnabled &&
      org.slackCookingMonthlyLastKey !== nextMonthKey
    ) {
      const text = buildMonthlyCookingReminderText({
        targetYear: nextMonthAnchor.getUTCFullYear(),
        targetMonth: nextMonthAnchor.getUTCMonth() + 1,
        spaceId,
      });
      const result = await postToSlack(text, org.slackCookingMonthlyWebhookUrl);
      if (result.ok && !result.skipped) {
        await prisma.organization.update({
          where: { id: org.id },
          data: { slackCookingMonthlyLastKey: nextMonthKey },
        });
        summary.monthlySent += 1;
      } else if (!result.ok) {
        summary.errors += 1;
      } else {
        summary.skipped += 1;
      }
    }
  }

  return summary;
}
