import type {
  NewsletterCampaignStatus,
  NewsletterFrequency,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import {
  DEFAULT_WEEKDAYS_BY_FREQUENCY,
  type NewsletterFrequencyValue,
} from "@/lib/newsletter-constants";

export {
  NEWSLETTER_FREQUENCIES,
  NEWSLETTER_FREQUENCY_LABELS,
  NEWSLETTER_CAMPAIGN_STATUSES,
  NEWSLETTER_CAMPAIGN_STATUS_LABELS,
  WEEKDAYS,
  WEEKDAY_LABELS,
  DEFAULT_WEEKDAYS_BY_FREQUENCY,
  GENERATE_HORIZON_WEEKS,
  GENERATE_HORIZON_LABELS,
  isNewsletterFrequency,
  isNewsletterCampaignStatus,
  parseWeekdays,
  isoWeekdayFromDateKey,
  formatWeekdays,
  scheduledDateKeysForWeeks,
  nextScheduledDateKey,
  type NewsletterFrequencyValue,
  type NewsletterCampaignStatusValue,
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
    where: { organizationId, active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

export async function listNewsletterCampaigns(
  organizationId: string,
  options?: {
    typeId?: string;
    status?: NewsletterCampaignStatus;
    take?: number;
  },
) {
  return prisma.newsletterCampaign.findMany({
    where: {
      type: { organizationId },
      ...(options?.typeId ? { typeId: options.typeId } : {}),
      ...(options?.status ? { status: options.status } : {}),
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
