"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { migrateCampaignsAfterWeekdayChange, isShiftPlanManagedType } from "@/lib/shift-plan";
import { requireEditorialLead, requireMembership } from "@/lib/session";
import { membershipInTagPool } from "@/lib/membership-grants";
import {
  formatWeekdays,
  frequencyFromWeekdays,
  isoWeekdayFromDateKey,
  isWeekday,
  NEWSLETTER_VISIBLE_STATUSES,
  scheduledDateKeysForWeeks,
  WEEKDAY_FULL_LABELS,
} from "@/lib/newsletter-constants";

const newsletterTypeSchema = z.object({
  name: z.string().trim().min(1).max(120),
  weekdays: z
    .array(z.coerce.number().int().min(1).max(7))
    .min(1, "Mindestens ein Wochentag")
    .transform((days) => [...new Set(days)].sort((a, b) => a - b)),
  requiresWordle: z
    .union([z.literal("true"), z.literal("on"), z.literal("false"), z.null()])
    .optional()
    .transform((v) => v === "true" || v === "on"),
});

function parseNewsletterTypeForm(formData: FormData) {
  return newsletterTypeSchema.safeParse({
    name: formData.get("name"),
    weekdays: formData.getAll("weekdays"),
    requiresWordle: formData.get("requiresWordle") ?? null,
  });
}

export async function createNewsletterType(formData: FormData) {
  const { membership } = await requireEditorialLead();
  const parsed = parseNewsletterTypeForm(formData);
  if (!parsed.success) {
    return { error: "Name und mind. ein Wochentag nötig." };
  }

  const frequency = frequencyFromWeekdays(parsed.data.weekdays);

  const existing = await prisma.newsletterType.findUnique({
    where: {
      organizationId_name: {
        organizationId: membership.organizationId,
        name: parsed.data.name,
      },
    },
  });
  if (existing) {
    if (!existing.active) {
      await prisma.newsletterType.update({
        where: { id: existing.id },
        data: {
          active: true,
          frequency,
          weekdays: parsed.data.weekdays,
          requiresWordle: parsed.data.requiresWordle,
        },
      });
      revalidatePath("/settings/newsletter");
      revalidatePath("/newsletter");
      return { ok: true as const, id: existing.id };
    }
    return { error: "Diesen Newsletter-Typ gibt es schon." };
  }

  const maxSort = await prisma.newsletterType.aggregate({
    where: { organizationId: membership.organizationId },
    _max: { sortOrder: true },
  });

  const created = await prisma.newsletterType.create({
    data: {
      organizationId: membership.organizationId,
      name: parsed.data.name,
      frequency,
      weekdays: parsed.data.weekdays,
      requiresWordle: parsed.data.requiresWordle,
      sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
    },
  });

  revalidatePath("/settings/newsletter");
  revalidatePath("/newsletter");
  return { ok: true as const, id: created.id };
}

export async function updateNewsletterType(formData: FormData) {
  const { membership } = await requireEditorialLead();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Fehlende ID." };

  const parsed = parseNewsletterTypeForm(formData);
  if (!parsed.success) {
    return { error: "Name und mind. ein Wochentag nötig." };
  }

  const type = await prisma.newsletterType.findFirst({
    where: { id, organizationId: membership.organizationId },
  });
  if (!type) return { error: "Kein Zugriff." };

  const clash = await prisma.newsletterType.findFirst({
    where: {
      organizationId: membership.organizationId,
      name: parsed.data.name,
      NOT: { id },
    },
  });
  if (clash) return { error: "Diesen Namen gibt es schon." };

  const oldWeekdays = [...type.weekdays].sort((a, b) => a - b);
  const newWeekdays = [...parsed.data.weekdays].sort((a, b) => a - b);
  const weekdaysChanged =
    oldWeekdays.length !== newWeekdays.length ||
    oldWeekdays.some((d, i) => d !== newWeekdays[i]);

  await prisma.newsletterType.update({
    where: { id },
    data: {
      name: parsed.data.name,
      frequency: frequencyFromWeekdays(parsed.data.weekdays),
      weekdays: parsed.data.weekdays,
      requiresWordle: parsed.data.requiresWordle,
    },
  });

  if (
    weekdaysChanged &&
    type.schedulingMode !== "manualDates" &&
    parsed.data.weekdays.length > 0
  ) {
    await migrateCampaignsAfterWeekdayChange(id, parsed.data.weekdays);
  }

  revalidatePath("/settings/newsletter");
  revalidatePath("/newsletter");
  revalidatePath("/schichtplan");
  revalidatePath("/settings/schichtplan");
  return { ok: true as const };
}

/** Soft-delete: Typ wird ausgeblendet, Campaigns bleiben erhalten. */
export async function deleteNewsletterType(formData: FormData) {
  const { membership } = await requireEditorialLead();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Fehlende ID." };

  const type = await prisma.newsletterType.findFirst({
    where: {
      id,
      organizationId: membership.organizationId,
      active: true,
      isNewsletter: true,
    },
  });
  if (!type) return { error: "Typ nicht gefunden." };

  if (isShiftPlanManagedType(type.name)) {
    // Schichtplan-Typen bleiben aktiv, verschwinden nur aus dem Newsletter-Kalender.
    await prisma.newsletterType.update({
      where: { id },
      data: { isNewsletter: false },
    });
  } else {
    await prisma.newsletterType.update({
      where: { id },
      data: { active: false },
    });
  }

  revalidatePath("/settings/newsletter");
  revalidatePath("/newsletter");
  revalidatePath("/schichtplan");
  revalidatePath("/settings/schichtplan");
  return { ok: true as const };
}

export async function updateNewsletterHideHolidays(formData: FormData) {
  const { membership } = await requireEditorialLead();
  const hide = formData.get("hidePublicHolidays") === "on" ||
    formData.get("hidePublicHolidays") === "true";

  await prisma.organization.update({
    where: { id: membership.organizationId },
    data: { hideNewsletterHolidays: hide },
  });

  revalidatePath("/settings/newsletter");
  revalidatePath("/newsletter");
  return { ok: true as const };
}

const blockedRangeSchema = z.object({
  newsletterTypeId: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  label: z
    .string()
    .trim()
    .max(120)
    .transform((v) => (v.length === 0 ? null : v)),
});

export async function createNewsletterBlockedRange(formData: FormData) {
  const { membership } = await requireEditorialLead();
  const parsed = blockedRangeSchema.safeParse({
    newsletterTypeId: formData.get("newsletterTypeId"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    label: formData.get("label") ?? "",
  });
  if (!parsed.success) {
    return { error: "Bitte Newsletter-Typ sowie Start- und Enddatum prüfen." };
  }
  if (parsed.data.endDate < parsed.data.startDate) {
    return { error: "Enddatum muss nach dem Startdatum liegen." };
  }

  const type = await prisma.newsletterType.findFirst({
    where: {
      id: parsed.data.newsletterTypeId,
      organizationId: membership.organizationId,
      active: true,
    },
  });
  if (!type) return { error: "Newsletter-Typ nicht gefunden." };

  await prisma.newsletterBlockedRange.create({
    data: {
      organizationId: membership.organizationId,
      newsletterTypeId: type.id,
      startDate: new Date(`${parsed.data.startDate}T12:00:00.000Z`),
      endDate: new Date(`${parsed.data.endDate}T12:00:00.000Z`),
      label: parsed.data.label,
    },
  });

  revalidatePath("/settings/newsletter");
  revalidatePath("/newsletter");
  return { ok: true as const };
}

export async function deleteNewsletterBlockedRange(formData: FormData) {
  const { membership } = await requireEditorialLead();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Fehlende ID." };

  const range = await prisma.newsletterBlockedRange.findFirst({
    where: { id, organizationId: membership.organizationId },
  });
  if (!range) return { error: "Kein Zugriff." };

  await prisma.newsletterBlockedRange.delete({ where: { id } });

  revalidatePath("/settings/newsletter");
  revalidatePath("/newsletter");
  return { ok: true as const };
}

function assertCampaignMatchesSchedule(
  weekdays: number[],
  dateKey: string,
  schedulingMode?: string,
): string | null {
  if (schedulingMode === "manualDates") return null;
  if (weekdays.length === 0) return null;
  const weekday = isoWeekdayFromDateKey(dateKey);
  if (!weekday || !weekdays.includes(weekday)) {
    const dayLabel =
      weekday && isWeekday(weekday)
        ? WEEKDAY_FULL_LABELS[weekday]
        : "Dieses Datum";
    return `${dayLabel} ist kein Erscheinungstag (${formatWeekdays(weekdays)}).`;
  }
  return null;
}

const newsletterCampaignSchema = z.object({
  typeId: z.string().min(1),
  authorId: z
    .string()
    .trim()
    .transform((v) => (v.length === 0 ? null : v)),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  campaignUrl: z
    .string()
    .trim()
    .transform((v) => (v.length === 0 ? null : v))
    .pipe(z.union([z.null(), z.string().url()])),
  status: z.enum(["planned", "published", "skipped"]).default("published"),
  note: z
    .string()
    .trim()
    .max(500)
    .transform((v) => (v.length === 0 ? null : v)),
  wordleWord: z
    .string()
    .trim()
    .transform((v) => (v.length === 0 ? null : v.toLocaleUpperCase("de-CH")))
    .pipe(
      z.union([
        z.null(),
        z
          .string()
          .regex(
            /^[A-ZÄÖÜ]{5}$/,
            "Wordle-Wort muss genau 5 Buchstaben sein",
          ),
      ]),
    ),
});

async function resolveOptionalAuthor(
  organizationId: string,
  authorId: string | null,
  currentAuthorId?: string | null,
) {
  if (!authorId) return { ok: true as const, authorId: null };
  const authorMembership = await prisma.membership.findUnique({
    where: {
      organizationId_userId: {
        organizationId,
        userId: authorId,
      },
    },
  });
  if (!authorMembership || authorMembership.archivedAt) {
    return { ok: false as const, error: "Autor:in ist nicht im Team." };
  }
  if (currentAuthorId && authorId === currentAuthorId) {
    return { ok: true as const, authorId };
  }
  const inPool = await membershipInTagPool(
    organizationId,
    authorId,
    "editorial",
  );
  if (!inPool) {
    return { ok: false as const, error: "Autor:in ist nicht in der Redaktion." };
  }
  return { ok: true as const, authorId };
}

export async function createNewsletterCampaign(formData: FormData) {
  const { session, membership } = await requireMembership();
  const parsed = newsletterCampaignSchema.safeParse({
    typeId: formData.get("typeId"),
    authorId: formData.get("authorId") ?? "",
    date: formData.get("date"),
    campaignUrl: formData.get("campaignUrl") ?? "",
    status: formData.get("status") || "published",
    note: formData.get("note") ?? "",
    wordleWord: formData.get("wordleWord") ?? "",
  });
  if (!parsed.success) {
    return { error: "Bitte Typ, Datum und Wordle-Wort prüfen." };
  }

  const type = await prisma.newsletterType.findFirst({
    where: {
      id: parsed.data.typeId,
      organizationId: membership.organizationId,
      active: true,
    },
  });
  if (!type) return { error: "Newsletter-Typ nicht gefunden." };

  const scheduleError = assertCampaignMatchesSchedule(
    type.weekdays,
    parsed.data.date,
    type.schedulingMode,
  );
  if (scheduleError) return { error: scheduleError };

  const author = await resolveOptionalAuthor(
    membership.organizationId,
    parsed.data.authorId,
  );
  if (!author.ok) return { error: author.error };

  await prisma.newsletterCampaign.create({
    data: {
      typeId: type.id,
      authorId: author.authorId,
      createdById: session.user.id,
      date: new Date(`${parsed.data.date}T12:00:00.000Z`),
      campaignUrl: parsed.data.campaignUrl,
      status: parsed.data.status,
      note: parsed.data.note,
      wordleWord: parsed.data.wordleWord,
    },
  });

  revalidatePath("/newsletter");
  return { ok: true as const };
}

export async function updateNewsletterCampaign(formData: FormData) {
  const { membership } = await requireMembership();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Fehlende ID." };

  const parsed = newsletterCampaignSchema.safeParse({
    typeId: formData.get("typeId"),
    authorId: formData.get("authorId") ?? "",
    date: formData.get("date"),
    campaignUrl: formData.get("campaignUrl") ?? "",
    status: formData.get("status") || "published",
    note: formData.get("note") ?? "",
    wordleWord: formData.get("wordleWord") ?? "",
  });
  if (!parsed.success) {
    return { error: "Bitte Typ, Datum und Wordle-Wort prüfen." };
  }

  const campaign = await prisma.newsletterCampaign.findUnique({
    where: { id },
    include: { type: true },
  });
  if (
    !campaign ||
    campaign.type.organizationId !== membership.organizationId
  ) {
    return { error: "Kein Zugriff." };
  }
  if (campaign.status === "proposed") {
    return {
      error:
        "Schichtplan-Vorschläge bitte im Schichtplan bearbeiten oder bestätigen.",
    };
  }

  const type = await prisma.newsletterType.findFirst({
    where: {
      id: parsed.data.typeId,
      organizationId: membership.organizationId,
      active: true,
    },
  });
  if (!type) return { error: "Newsletter-Typ nicht gefunden." };

  const scheduleError = assertCampaignMatchesSchedule(
    type.weekdays,
    parsed.data.date,
    type.schedulingMode,
  );
  if (scheduleError) return { error: scheduleError };

  const author = await resolveOptionalAuthor(
    membership.organizationId,
    parsed.data.authorId,
    campaign.authorId,
  );
  if (!author.ok) return { error: author.error };

  await prisma.newsletterCampaign.update({
    where: { id },
    data: {
      typeId: type.id,
      authorId: author.authorId,
      date: new Date(`${parsed.data.date}T12:00:00.000Z`),
      campaignUrl: parsed.data.campaignUrl,
      status: parsed.data.status,
      note: parsed.data.note,
      wordleWord: parsed.data.wordleWord,
    },
  });

  revalidatePath("/newsletter");
  return { ok: true as const };
}

export async function deleteNewsletterCampaign(formData: FormData) {
  const { membership } = await requireMembership();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Fehlende ID." };

  const campaign = await prisma.newsletterCampaign.findUnique({
    where: { id },
    include: { type: true },
  });
  if (
    !campaign ||
    campaign.type.organizationId !== membership.organizationId
  ) {
    return { error: "Kein Zugriff." };
  }

  await prisma.newsletterCampaign.delete({ where: { id } });
  revalidatePath("/newsletter");
  return { ok: true as const };
}

function parseBulkIds(formData: FormData) {
  const raw = String(formData.get("ids") ?? "");
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function bulkDeleteNewsletterCampaigns(formData: FormData) {
  const { membership } = await requireMembership();
  const ids = parseBulkIds(formData);
  if (ids.length === 0) return { error: "Keine Kampagnen ausgewählt." };

  const campaigns = await prisma.newsletterCampaign.findMany({
    where: { id: { in: ids } },
    include: { type: { select: { organizationId: true } } },
  });
  if (campaigns.length !== ids.length) {
    return { error: "Mindestens eine Kampagne wurde nicht gefunden." };
  }
  if (
    campaigns.some((c) => c.type.organizationId !== membership.organizationId)
  ) {
    return { error: "Kein Zugriff." };
  }

  await prisma.newsletterCampaign.deleteMany({
    where: { id: { in: ids } },
  });
  revalidatePath("/newsletter");
  return { ok: true as const, count: ids.length };
}

export async function bulkAssignNewsletterCampaignAuthor(formData: FormData) {
  const { membership } = await requireMembership();
  const ids = parseBulkIds(formData);
  if (ids.length === 0) return { error: "Keine Kampagnen ausgewählt." };

  const author = await resolveOptionalAuthor(
    membership.organizationId,
    String(formData.get("authorId") ?? ""),
  );
  if (!author.ok) return { error: author.error };

  const campaigns = await prisma.newsletterCampaign.findMany({
    where: { id: { in: ids } },
    include: { type: { select: { organizationId: true } } },
  });
  if (campaigns.length !== ids.length) {
    return { error: "Mindestens eine Kampagne wurde nicht gefunden." };
  }
  if (
    campaigns.some((c) => c.type.organizationId !== membership.organizationId)
  ) {
    return { error: "Kein Zugriff." };
  }

  await prisma.newsletterCampaign.updateMany({
    where: { id: { in: ids } },
    data: { authorId: author.authorId },
  });
  revalidatePath("/newsletter");
  return { ok: true as const, count: ids.length };
}

const generateCampaignsSchema = z.object({
  typeId: z.string().min(1),
  authorId: z
    .string()
    .trim()
    .transform((v) => (v.length === 0 ? null : v)),
  weeksAhead: z.coerce
    .number()
    .int()
    .refine((n) => [2, 4, 8, 12, 26].includes(n)),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Startdatum ungültig."),
});

export async function generateNewsletterCampaigns(formData: FormData) {
  const { session, membership } = await requireMembership();
  const parsed = generateCampaignsSchema.safeParse({
    typeId: formData.get("typeId"),
    authorId: formData.get("authorId") ?? "",
    weeksAhead: formData.get("weeksAhead"),
    startDate: formData.get("startDate"),
  });
  if (!parsed.success) {
    return { error: "Typ, Startdatum und Zeitraum prüfen." };
  }

  const type = await prisma.newsletterType.findFirst({
    where: {
      id: parsed.data.typeId,
      organizationId: membership.organizationId,
      active: true,
    },
  });
  if (!type) return { error: "Newsletter-Typ nicht gefunden." };
  if (type.weekdays.length === 0) {
    return { error: "Für diesen Typ sind keine Erscheinungstage gesetzt." };
  }

  const author = await resolveOptionalAuthor(
    membership.organizationId,
    parsed.data.authorId,
  );
  if (!author.ok) return { error: author.error };

  const dateKeys = scheduledDateKeysForWeeks(
    type.weekdays,
    parsed.data.weeksAhead,
    parsed.data.startDate,
  );
  if (dateKeys.length === 0) {
    return { error: "Keine Erscheinungstage im gewählten Zeitraum." };
  }

  const dates = dateKeys.map((key) => new Date(`${key}T12:00:00.000Z`));
  // Include proposed so Schichtplan drafts block duplicate rhythm slots.
  const existing = await prisma.newsletterCampaign.findMany({
    where: {
      typeId: type.id,
      date: { in: dates },
    },
    select: { date: true },
  });
  const existingKeys = new Set(
    existing.map((e) => e.date.toISOString().slice(0, 10)),
  );
  const toCreate = dateKeys.filter((key) => !existingKeys.has(key));

  if (toCreate.length > 0) {
    await prisma.newsletterCampaign.createMany({
      data: toCreate.map((key) => ({
        typeId: type.id,
        authorId: author.authorId,
        createdById: session.user.id,
        date: new Date(`${key}T12:00:00.000Z`),
        status: "planned" as const,
      })),
      skipDuplicates: true,
    });
  }

  revalidatePath("/newsletter");
  return {
    ok: true as const,
    created: toCreate.length,
    skippedExisting: dateKeys.length - toCreate.length,
  };
}

const newsletterSlotSchema = z.object({
  typeId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  authorId: z
    .string()
    .trim()
    .transform((v) => (v.length === 0 ? null : v)),
  campaignUrl: z
    .string()
    .trim()
    .transform((v) => (v.length === 0 ? null : v))
    .pipe(z.union([z.null(), z.string().url()])),
  note: z
    .string()
    .trim()
    .max(500)
    .transform((v) => (v.length === 0 ? null : v)),
  wordleWord: z
    .string()
    .trim()
    .transform((v) => (v.length === 0 ? null : v.toLocaleUpperCase("de-CH")))
    .pipe(
      z.union([
        z.null(),
        z
          .string()
          .regex(
            /^[A-ZÄÖÜ]{5}$/,
            "Wordle-Wort muss genau 5 Buchstaben sein",
          ),
      ]),
    ),
});

/** Book or update a rhythm slot (author + URL). */
export async function upsertNewsletterSlot(formData: FormData) {
  const { session, membership } = await requireMembership();
  const parsed = newsletterSlotSchema.safeParse({
    typeId: formData.get("typeId"),
    date: formData.get("date"),
    authorId: formData.get("authorId") ?? "",
    campaignUrl: formData.get("campaignUrl") ?? "",
    note: formData.get("note") ?? "",
    wordleWord: formData.get("wordleWord") ?? "",
  });
  if (!parsed.success) {
    return { error: "Bitte Typ, Datum, Link und Wordle-Wort prüfen." };
  }

  const type = await prisma.newsletterType.findFirst({
    where: {
      id: parsed.data.typeId,
      organizationId: membership.organizationId,
      active: true,
    },
  });
  if (!type) return { error: "Newsletter-Typ nicht gefunden." };

  const scheduleError = assertCampaignMatchesSchedule(
    type.weekdays,
    parsed.data.date,
    type.schedulingMode,
  );
  if (scheduleError) return { error: scheduleError };

  const date = new Date(`${parsed.data.date}T12:00:00.000Z`);
  // Do not overwrite Schichtplan drafts from the newsletter calendar.
  const existing = await prisma.newsletterCampaign.findFirst({
    where: {
      typeId: type.id,
      date,
      status: { in: [...NEWSLETTER_VISIBLE_STATUSES] },
    },
  });
  const proposedBlocking = await prisma.newsletterCampaign.findFirst({
    where: { typeId: type.id, date, status: "proposed" },
    select: { id: true },
  });
  if (!existing && proposedBlocking) {
    return {
      error:
        "Für dieses Datum gibt es einen Schichtplan-Vorschlag — bitte im Schichtplan bearbeiten.",
    };
  }

  const author = await resolveOptionalAuthor(
    membership.organizationId,
    parsed.data.authorId,
    existing?.authorId,
  );
  if (!author.ok) return { error: author.error };

  // Ignore wordle when type does not use it
  const wordleWord = type.requiresWordle ? parsed.data.wordleWord : null;

  const status =
    parsed.data.campaignUrl || author.authorId ? "published" : "planned";

  if (existing) {
    await prisma.newsletterCampaign.update({
      where: { id: existing.id },
      data: {
        authorId: author.authorId,
        campaignUrl: parsed.data.campaignUrl,
        note: parsed.data.note,
        wordleWord,
        status,
      },
    });
  } else {
    await prisma.newsletterCampaign.create({
      data: {
        typeId: type.id,
        authorId: author.authorId,
        createdById: session.user.id,
        date,
        campaignUrl: parsed.data.campaignUrl,
        note: parsed.data.note,
        wordleWord,
        status,
      },
    });
  }

  revalidatePath("/newsletter");
  return { ok: true as const };
}

/** Mark a rhythm slot as skipped (e.g. holiday / Sommerpause). */
export async function skipNewsletterSlot(formData: FormData) {
  const { session, membership } = await requireMembership();
  const typeId = String(formData.get("typeId") ?? "");
  const dateKey = String(formData.get("date") ?? "");
  const noteRaw = String(formData.get("note") ?? "").trim();
  if (!typeId || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    return { error: "Typ und Datum fehlen." };
  }

  const type = await prisma.newsletterType.findFirst({
    where: {
      id: typeId,
      organizationId: membership.organizationId,
      active: true,
    },
  });
  if (!type) return { error: "Newsletter-Typ nicht gefunden." };

  const scheduleError = assertCampaignMatchesSchedule(
    type.weekdays,
    dateKey,
    type.schedulingMode,
  );
  if (scheduleError) return { error: scheduleError };

  const date = new Date(`${dateKey}T12:00:00.000Z`);
  const existing = await prisma.newsletterCampaign.findFirst({
    where: { typeId: type.id, date },
  });
  const note = noteRaw || null;

  if (existing) {
    await prisma.newsletterCampaign.update({
      where: { id: existing.id },
      data: { status: "skipped", note },
    });
  } else {
    await prisma.newsletterCampaign.create({
      data: {
        typeId: type.id,
        createdById: session.user.id,
        date,
        status: "skipped",
        note,
      },
    });
  }

  revalidatePath("/newsletter");
  return { ok: true as const };
}

/** Clear a slot back to open (delete campaign row). */
export async function clearNewsletterSlot(formData: FormData) {
  const { membership } = await requireMembership();
  const typeId = String(formData.get("typeId") ?? "");
  const dateKey = String(formData.get("date") ?? "");
  const campaignId = String(formData.get("id") ?? "");

  if (campaignId) {
    const campaign = await prisma.newsletterCampaign.findUnique({
      where: { id: campaignId },
      include: { type: true },
    });
    if (
      !campaign ||
      campaign.type.organizationId !== membership.organizationId
    ) {
      return { error: "Eintrag nicht gefunden." };
    }
    await prisma.newsletterCampaign.delete({ where: { id: campaign.id } });
    revalidatePath("/newsletter");
    return { ok: true as const };
  }

  if (!typeId || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    return { error: "Typ und Datum fehlen." };
  }

  const type = await prisma.newsletterType.findFirst({
    where: {
      id: typeId,
      organizationId: membership.organizationId,
    },
  });
  if (!type) return { error: "Newsletter-Typ nicht gefunden." };

  await prisma.newsletterCampaign.deleteMany({
    where: {
      typeId: type.id,
      date: new Date(`${dateKey}T12:00:00.000Z`),
    },
  });
  revalidatePath("/newsletter");
  return { ok: true as const };
}

