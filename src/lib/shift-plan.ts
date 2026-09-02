import type {
  NewsletterCampaignStatus,
  NewsletterFrequency,
  NewsletterSchedulingMode,
} from "@/generated/prisma/client";
import { endOfMonth, format, parseISO, startOfMonth } from "date-fns";
import { de } from "date-fns/locale";
import { prisma } from "@/lib/db";
import { monthParamKey, parseMonthParam } from "@/lib/newsletter";
import {
  DEFAULT_WEEKDAYS_BY_FREQUENCY,
  isoWeekdayFromDateKey,
  pickClosestWeekday,
  scheduledDateKeysInMonth,
  scheduledOrCampaignDateKeysInMonth,
  shiftDateKeyToWeekday,
  WEEKDAY_LABELS,
  type Weekday,
} from "@/lib/newsletter-constants";

export { parseMonthParam, monthParamKey };

/**
 * Repo is stored as a NewsletterType with isNewsletter=false so shift
 * assignments reuse NewsletterCampaign (typeId, authorId, date, status)
 * without appearing in the newsletter calendar.
 */
const SHIFT_PLAN_TYPES: {
  name: string;
  frequency: NewsletterFrequency;
  weekdays: number[];
  isNewsletter: boolean;
  isEveningShift: boolean;
  schedulingMode: NewsletterSchedulingMode;
}[] = [
  {
    name: "Züri Briefing",
    frequency: "weekly",
    weekdays: DEFAULT_WEEKDAYS_BY_FREQUENCY.weekly,
    isNewsletter: true,
    isEveningShift: true,
    schedulingMode: "newsletter",
  },
  {
    name: "Wohnbrief",
    frequency: "weekly",
    weekdays: [3],
    isNewsletter: true,
    isEveningShift: true,
    schedulingMode: "newsletter",
  },
  {
    name: "Tsüritipp",
    frequency: "weekly",
    weekdays: [4],
    isNewsletter: true,
    isEveningShift: true,
    schedulingMode: "newsletter",
  },
  {
    name: "Gemeinderats-Briefing",
    frequency: "weekly",
    weekdays: [],
    isNewsletter: true,
    isEveningShift: true,
    schedulingMode: "manualDates",
  },
  {
    name: "Repo",
    frequency: "daily",
    weekdays: DEFAULT_WEEKDAYS_BY_FREQUENCY.daily,
    isNewsletter: false,
    isEveningShift: false,
    schedulingMode: "newsletter",
  },
];

export const SHIFT_PLAN_MANAGED_TYPE_NAMES = SHIFT_PLAN_TYPES.map((t) => t.name);

export function isShiftPlanManagedType(name: string): boolean {
  return SHIFT_PLAN_MANAGED_TYPE_NAMES.includes(name);
}

export const COUNCIL_TYPE_NAME = "Gemeinderats-Briefing";
export const BRIEFING_TYPE_NAME = "Züri Briefing";
export const REPO_TYPE_NAME = "Repo";

export async function ensureShiftPlanTypes(organizationId: string) {
  const existing = await prisma.newsletterType.findMany({
    where: { organizationId },
    select: {
      id: true,
      name: true,
      active: true,
      isNewsletter: true,
      isEveningShift: true,
      schedulingMode: true,
      weekdays: true,
      sortOrder: true,
    },
  });
  const byName = new Map(existing.map((t) => [t.name, t]));
  const maxSort = existing.reduce((m, t) => Math.max(m, t.sortOrder), -1);
  let nextSort = maxSort + 1;

  for (const def of SHIFT_PLAN_TYPES) {
    const row = byName.get(def.name);
    if (!row) {
      await prisma.newsletterType.create({
        data: {
          organizationId,
          name: def.name,
          frequency: def.frequency,
          weekdays: def.weekdays,
          isNewsletter: def.isNewsletter,
          isEveningShift: def.isEveningShift,
          schedulingMode: def.schedulingMode,
          sortOrder: nextSort++,
          active: true,
        },
      });
      continue;
    }

    // Respect soft-deletes and user-hidden newsletter types.
    if (!row.active) continue;

    const patch: {
      isNewsletter?: boolean;
      isEveningShift?: boolean;
      schedulingMode?: NewsletterSchedulingMode;
      weekdays?: number[];
      frequency?: NewsletterFrequency;
    } = {};

    // Only force isNewsletter=false (e.g. Repo); never re-enable newsletter calendar.
    if (row.isNewsletter !== def.isNewsletter && def.isNewsletter === false) {
      patch.isNewsletter = def.isNewsletter;
    }
    if (row.isEveningShift !== def.isEveningShift) {
      patch.isEveningShift = def.isEveningShift;
    }
    if (row.schedulingMode !== def.schedulingMode) {
      patch.schedulingMode = def.schedulingMode;
    }
    // Only seed weekdays when empty (preserve manual schedule edits).
    if (row.weekdays.length === 0 && def.weekdays.length > 0) {
      patch.weekdays = def.weekdays;
      patch.frequency = def.frequency;
    }
    // manualDates types should keep empty weekdays
    if (
      def.schedulingMode === "manualDates" &&
      row.weekdays.length > 0 &&
      row.schedulingMode !== "manualDates"
    ) {
      patch.weekdays = [];
    }

    if (Object.keys(patch).length > 0) {
      await prisma.newsletterType.update({
        where: { id: row.id },
        data: patch,
      });
    }
  }
}

export async function listShiftPlanTypes(organizationId: string) {
  return prisma.newsletterType.findMany({
    where: { organizationId, active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

export async function listShiftQuotas(organizationId: string) {
  return prisma.shiftQuota.findMany({
    where: { organizationId },
    include: {
      user: { select: { id: true, name: true } },
      newsletterType: {
        select: { id: true, name: true, isEveningShift: true },
      },
    },
    orderBy: [
      { user: { name: "asc" } },
      { newsletterType: { sortOrder: "asc" } },
    ],
  });
}

export type ShiftPlanSlot = {
  dateKey: string;
  typeId: string;
  typeName: string;
  isEveningShift: boolean;
  isNewsletter: boolean;
  campaign: {
    id: string;
    authorId: string | null;
    authorName: string | null;
    status: NewsletterCampaignStatus;
    note: string | null;
  } | null;
};

export type ShiftPlanDay = {
  dateKey: string;
  weekdayLabel: string;
  slots: ShiftPlanSlot[];
};

export async function listShiftPlanMonth(
  organizationId: string,
  monthAnchor: Date = new Date(),
): Promise<{
  monthStart: Date;
  monthEnd: Date;
  monthLabel: string;
  monthKey: string;
  prevMonth: string;
  nextMonth: string;
  days: ShiftPlanDay[];
}> {
  const monthStart = startOfMonth(monthAnchor);
  const monthEnd = endOfMonth(monthAnchor);
  const year = monthStart.getFullYear();
  const monthIndex0 = monthStart.getMonth();

  const [types, campaigns] = await Promise.all([
    listShiftPlanTypes(organizationId),
    prisma.newsletterCampaign.findMany({
      where: {
        type: { organizationId, active: true },
        date: {
          gte: new Date(`${format(monthStart, "yyyy-MM-dd")}T12:00:00.000Z`),
          lte: new Date(`${format(monthEnd, "yyyy-MM-dd")}T12:00:00.000Z`),
        },
      },
      include: {
        author: { select: { id: true, name: true } },
        type: {
          select: {
            id: true,
            name: true,
            isEveningShift: true,
            isNewsletter: true,
            schedulingMode: true,
            weekdays: true,
          },
        },
      },
    }),
  ]);

  const campaignByKey = new Map<string, (typeof campaigns)[number]>();
  for (const c of campaigns) {
    const dateKey = c.date.toISOString().slice(0, 10);
    campaignByKey.set(`${c.typeId}:${dateKey}`, c);
  }

  const byDate = new Map<string, ShiftPlanSlot[]>();

  for (const type of types) {
    let keys: string[];
    if (type.schedulingMode === "manualDates") {
      keys = campaigns
        .filter((c) => c.typeId === type.id)
        .map((c) => c.date.toISOString().slice(0, 10));
      keys = [...new Set(keys)].sort();
    } else {
      const campaignKeys = campaigns
        .filter((c) => c.typeId === type.id)
        .map((c) => c.date.toISOString().slice(0, 10));
      keys = scheduledOrCampaignDateKeysInMonth(
        type.weekdays,
        year,
        monthIndex0,
        campaignKeys,
      );
    }

    for (const dateKey of keys) {
      const existing = campaignByKey.get(`${type.id}:${dateKey}`);
      const slot: ShiftPlanSlot = {
        dateKey,
        typeId: type.id,
        typeName: type.name,
        isEveningShift: type.isEveningShift,
        isNewsletter: type.isNewsletter,
        campaign: existing
          ? {
              id: existing.id,
              authorId: existing.authorId,
              authorName: existing.author?.name ?? null,
              status: existing.status,
              note: existing.note,
            }
          : null,
      };
      const list = byDate.get(dateKey) ?? [];
      list.push(slot);
      byDate.set(dateKey, list);
    }
  }

  const days: ShiftPlanDay[] = [...byDate.keys()]
    .sort()
    .map((dateKey) => {
      const wd = isoWeekdayFromDateKey(dateKey) as Weekday;
      return {
        dateKey,
        weekdayLabel: WEEKDAY_LABELS[wd],
        slots: byDate.get(dateKey) ?? [],
      };
    });

  const prev = new Date(year, monthIndex0 - 1, 1);
  const next = new Date(year, monthIndex0 + 1, 1);

  return {
    monthStart,
    monthEnd,
    monthLabel: format(monthStart, "MMMM yyyy", { locale: de }),
    monthKey: monthParamKey(monthStart),
    prevMonth: monthParamKey(prev),
    nextMonth: monthParamKey(next),
    days,
  };
}

export async function listCouncilSessionStubs(
  organizationId: string,
  monthAnchor?: Date,
) {
  const council = await prisma.newsletterType.findFirst({
    where: {
      organizationId,
      name: COUNCIL_TYPE_NAME,
      active: true,
    },
  });
  if (!council) return [];

  const whereDate =
    monthAnchor != null
      ? {
          gte: new Date(
            `${format(startOfMonth(monthAnchor), "yyyy-MM-dd")}T12:00:00.000Z`,
          ),
          lte: new Date(
            `${format(endOfMonth(monthAnchor), "yyyy-MM-dd")}T12:00:00.000Z`,
          ),
        }
      : undefined;

  return prisma.newsletterCampaign.findMany({
    where: {
      typeId: council.id,
      ...(whereDate ? { date: whereDate } : {}),
    },
    include: {
      author: { select: { id: true, name: true } },
    },
    orderBy: { date: "asc" },
  });
}

export function parseMonthYear(month: number, year: number): Date {
  return startOfMonth(new Date(year, month - 1, 1));
}

export function parseIsoDateKey(value: string | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  try {
    return parseISO(`${value}T12:00:00.000Z`);
  } catch {
    return null;
  }
}

/**
 * When rhythm weekdays change, move future campaigns from old weekdays to the
 * new schedule (same calendar week). Keeps Schichtplan and Newsletter in sync.
 */
export async function migrateCampaignsAfterWeekdayChange(
  typeId: string,
  newWeekdays: number[],
) {
  const allowed = newWeekdays.filter(
    (d): d is Weekday => d >= 1 && d <= 7,
  );
  if (allowed.length === 0) return;

  const from = startOfMonth(new Date());
  const campaigns = await prisma.newsletterCampaign.findMany({
    where: {
      typeId,
      date: { gte: from },
      status: { not: "skipped" },
    },
    orderBy: { date: "asc" },
  });

  for (const campaign of campaigns) {
    const dateKey = campaign.date.toISOString().slice(0, 10);
    const currentWd = isoWeekdayFromDateKey(dateKey);
    if (currentWd != null && allowed.includes(currentWd)) continue;

    const targetWd = pickClosestWeekday(currentWd, allowed);
    if (targetWd == null) continue;

    const newDateKey = shiftDateKeyToWeekday(dateKey, targetWd);
    if (!newDateKey || newDateKey === dateKey) continue;

    const newDate = new Date(`${newDateKey}T12:00:00.000Z`);
    const existing = await prisma.newsletterCampaign.findFirst({
      where: { typeId, date: newDate },
    });

    if (existing) {
      if (existing.id === campaign.id) continue;
      const patch: {
        authorId?: string | null;
        status?: typeof campaign.status;
        note?: string | null;
      } = {};
      if (!existing.authorId && campaign.authorId) {
        patch.authorId = campaign.authorId;
      }
      if (existing.status === "planned" && campaign.status === "proposed") {
        patch.status = "proposed";
      }
      if (!existing.note && campaign.note) {
        patch.note = campaign.note;
      }
      if (Object.keys(patch).length > 0) {
        await prisma.newsletterCampaign.update({
          where: { id: existing.id },
          data: patch,
        });
      }
      await prisma.newsletterCampaign.delete({ where: { id: campaign.id } });
      continue;
    }

    await prisma.newsletterCampaign.update({
      where: { id: campaign.id },
      data: { date: newDate },
    });
  }
}
