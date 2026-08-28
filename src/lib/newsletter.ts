import type {
  NewsletterCampaignStatus,
  NewsletterFrequency,
} from "@/generated/prisma/client";
import { endOfMonth, format, parseISO, startOfMonth } from "date-fns";
import { de } from "date-fns/locale";
import { prisma } from "@/lib/db";
import {
  DEFAULT_WEEKDAYS_BY_FREQUENCY,
  NEWSLETTER_VISIBLE_STATUSES,
  scheduledDateKeysInMonth,
  type NewsletterCampaignStatusValue,
  type NewsletterFrequencyValue,
  WEEKDAY_LABELS,
  type Weekday,
} from "@/lib/newsletter-constants";
import { holidayNameForDate } from "@/lib/time-tracking";

export {
  NEWSLETTER_FREQUENCIES,
  NEWSLETTER_FREQUENCY_LABELS,
  NEWSLETTER_CAMPAIGN_STATUSES,
  NEWSLETTER_VISIBLE_STATUSES,
  NEWSLETTER_CAMPAIGN_STATUS_LABELS,
  NEWSLETTER_SCHEDULING_MODES,
  NEWSLETTER_SCHEDULING_MODE_LABELS,
  WEEKDAYS,
  WEEKDAY_LABELS,
  DEFAULT_WEEKDAYS_BY_FREQUENCY,
  GENERATE_HORIZON_WEEKS,
  GENERATE_HORIZON_LABELS,
  isNewsletterFrequency,
  isNewsletterCampaignStatus,
  isNewsletterVisibleStatus,
  isNewsletterSchedulingMode,
  parseWeekdays,
  isoWeekdayFromDateKey,
  formatWeekdays,
  scheduledDateKeysForWeeks,
  scheduledDateKeysInMonth,
  nextScheduledDateKey,
  todayDateKey,
  type NewsletterFrequencyValue,
  type NewsletterCampaignStatusValue,
  type NewsletterVisibleStatusValue,
  type NewsletterSchedulingModeValue,
  type Weekday,
  type GenerateHorizonWeeks,
} from "@/lib/newsletter-constants";

const DEFAULT_TYPES: {
  name: string;
  frequency: NewsletterFrequency;
  weekdays: number[];
}[] = [
  {
    name: "Züri Briefing",
    frequency: "weekly",
    weekdays: DEFAULT_WEEKDAYS_BY_FREQUENCY.weekly,
  },
];

export async function ensureDefaultNewsletterTypes(organizationId: string) {
  const count = await prisma.newsletterType.count({
    where: { organizationId },
  });
  if (count === 0) {
    await prisma.newsletterType.createMany({
      data: DEFAULT_TYPES.map((t, index) => ({
        organizationId,
        name: t.name,
        frequency: t.frequency,
        weekdays: t.weekdays,
        sortOrder: index,
      })),
    });
  }

  const missingSchedule = await prisma.newsletterType.findMany({
    where: { organizationId, weekdays: { isEmpty: true } },
    select: { id: true, frequency: true },
  });
  for (const type of missingSchedule) {
    const freq = type.frequency as NewsletterFrequencyValue;
    await prisma.newsletterType.update({
      where: { id: type.id },
      data: {
        weekdays: DEFAULT_WEEKDAYS_BY_FREQUENCY[freq] ?? [1, 2, 3, 4, 5],
      },
    });
  }
}

export async function listNewsletterTypes(organizationId: string) {
  return prisma.newsletterType.findMany({
    where: { organizationId, active: true, isNewsletter: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

export async function listNewsletterCampaigns(
  organizationId: string,
  options?: {
    typeId?: string;
    status?: NewsletterCampaignStatus;
    /** Include Schichtplan drafts (`proposed`). Default: false. */
    includeProposed?: boolean;
    take?: number;
  },
) {
  return prisma.newsletterCampaign.findMany({
    where: {
      type: { organizationId },
      ...(options?.typeId ? { typeId: options.typeId } : {}),
      ...(options?.status
        ? { status: options.status }
        : options?.includeProposed
          ? {}
          : { status: { in: [...NEWSLETTER_VISIBLE_STATUSES] } }),
    },
    include: {
      type: {
        select: { id: true, name: true, frequency: true, weekdays: true },
      },
      author: { select: { id: true, name: true } },
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: options?.take,
  });
}

export type NewsletterCalendarSlot = {
  dateKey: string;
  typeId: string;
  typeName: string;
  requiresWordle: boolean;
  holidayName: string | null;
  campaign: {
    id: string;
    authorId: string | null;
    authorName: string | null;
    campaignUrl: string | null;
    status: NewsletterCampaignStatusValue;
    note: string | null;
    wordleWord: string | null;
  } | null;
};

export type NewsletterCalendarDay = {
  dateKey: string;
  weekdayLabel: string;
  holidayName: string | null;
  slots: NewsletterCalendarSlot[];
};

export function parseMonthParam(value: string | undefined): Date {
  if (value && /^\d{4}-\d{2}$/.test(value)) {
    try {
      return startOfMonth(parseISO(`${value}-01`));
    } catch {
      /* fallthrough */
    }
  }
  return startOfMonth(new Date());
}

export function monthParamKey(date: Date): string {
  return format(date, "yyyy-MM");
}

export type NewsletterBlockedRangeRow = {
  id: string;
  newsletterTypeId: string;
  startDate: Date;
  endDate: Date;
  label: string | null;
  newsletterType: { id: string; name: string };
};

export async function getNewsletterCalendarSettings(organizationId: string) {
  const [org, blockedRanges] = await Promise.all([
    prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { hideNewsletterHolidays: true },
    }),
    listNewsletterBlockedRanges(organizationId),
  ]);
  return {
    hidePublicHolidays: org.hideNewsletterHolidays,
    blockedRanges,
  };
}

export async function listNewsletterBlockedRanges(organizationId: string) {
  return prisma.newsletterBlockedRange.findMany({
    where: { organizationId },
    include: {
      newsletterType: { select: { id: true, name: true } },
    },
    orderBy: [
      { newsletterType: { sortOrder: "asc" } },
      { startDate: "asc" },
      { endDate: "asc" },
    ],
  });
}

function dateKeyInBlockedRanges(
  dateKey: string,
  ranges: { startDate: Date; endDate: Date; newsletterTypeId: string }[],
  typeId: string,
): boolean {
  return ranges.some((range) => {
    if (range.newsletterTypeId !== typeId) return false;
    const start = range.startDate.toISOString().slice(0, 10);
    const end = range.endDate.toISOString().slice(0, 10);
    return dateKey >= start && dateKey <= end;
  });
}

/** Virtual rhythm slots for a calendar month + existing campaigns. */
export async function listNewsletterCalendarMonth(
  organizationId: string,
  monthAnchor: Date = new Date(),
): Promise<{
  monthStart: Date;
  monthEnd: Date;
  monthLabel: string;
  prevMonth: string;
  nextMonth: string;
  days: NewsletterCalendarDay[];
}> {
  const monthStart = startOfMonth(monthAnchor);
  const monthEnd = endOfMonth(monthAnchor);
  const year = monthStart.getFullYear();
  const monthIndex0 = monthStart.getMonth();

  const [types, campaigns, settings] = await Promise.all([
    listNewsletterTypes(organizationId),
    prisma.newsletterCampaign.findMany({
      where: {
        type: { organizationId, active: true, isNewsletter: true },
        status: { in: [...NEWSLETTER_VISIBLE_STATUSES] },
        date: {
          gte: new Date(`${format(monthStart, "yyyy-MM-dd")}T12:00:00.000Z`),
          lte: new Date(`${format(monthEnd, "yyyy-MM-dd")}T12:00:00.000Z`),
        },
      },
      include: {
        author: { select: { id: true, name: true } },
      },
    }),
    getNewsletterCalendarSettings(organizationId),
  ]);

  const campaignByKey = new Map<string, (typeof campaigns)[number]>();
  for (const c of campaigns) {
    const dateKey = c.date.toISOString().slice(0, 10);
    campaignByKey.set(`${c.typeId}:${dateKey}`, c);
  }

  const byDate = new Map<string, NewsletterCalendarSlot[]>();

  for (const type of types) {
    const keys = scheduledDateKeysInMonth(type.weekdays, year, monthIndex0);
    for (const dateKey of keys) {
      const [y, m, d] = dateKey.split("-").map(Number);
      const holidayName = holidayNameForDate(
        new Date(Date.UTC(y!, m! - 1, d!, 12)),
      );

      if (settings.hidePublicHolidays && holidayName) continue;
      if (
        dateKeyInBlockedRanges(dateKey, settings.blockedRanges, type.id)
      ) {
        continue;
      }

      const existing = campaignByKey.get(`${type.id}:${dateKey}`);
      const slot: NewsletterCalendarSlot = {
        dateKey,
        typeId: type.id,
        typeName: type.name,
        requiresWordle: type.requiresWordle,
        holidayName,
        campaign: existing
          ? {
              id: existing.id,
              authorId: existing.authorId,
              authorName: existing.author?.name ?? null,
              campaignUrl: existing.campaignUrl,
              status: existing.status as NewsletterCampaignStatusValue,
              note: existing.note,
              wordleWord: existing.wordleWord,
            }
          : null,
      };
      const list = byDate.get(dateKey) ?? [];
      list.push(slot);
      byDate.set(dateKey, list);
    }
  }

  const days: NewsletterCalendarDay[] = [...byDate.keys()]
    .sort()
    .map((dateKey) => {
      const [y, m, d] = dateKey.split("-").map(Number);
      const date = new Date(Date.UTC(y!, m! - 1, d!, 12));
      const js = date.getUTCDay();
      const iso = (js === 0 ? 7 : js) as Weekday;
      return {
        dateKey,
        weekdayLabel: WEEKDAY_LABELS[iso],
        holidayName: holidayNameForDate(date),
        slots: byDate.get(dateKey) ?? [],
      };
    });

  const prev = new Date(year, monthIndex0 - 1, 1);
  const next = new Date(year, monthIndex0 + 1, 1);

  return {
    monthStart,
    monthEnd,
    monthLabel: format(monthStart, "MMMM yyyy", { locale: de }),
    prevMonth: monthParamKey(prev),
    nextMonth: monthParamKey(next),
    days,
  };
}
