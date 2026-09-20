"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireMembership } from "@/lib/session";
import {
  allowedDateModes,
  parseDateKey,
  validateScheduleFields,
  type CalendarDateMode,
  type CalendarEventFields,
  type CalendarFrequency,
} from "@/lib/editorial-calendar-shared";

function revalidateCalendar() {
  revalidatePath("/jahreskalender");
}

const colorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/)
  .optional();

const categorySchema = z.object({
  name: z.string().trim().min(1).max(80),
  color: colorSchema,
});

const eventSchema = z.object({
  title: z.string().trim().min(1).max(200),
  note: z
    .string()
    .trim()
    .max(5000)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  categoryId: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  frequency: z.enum([
    "once",
    "weekly",
    "monthly",
    "yearly",
    "every_n_years",
  ]),
  dateMode: z.enum(["fixed", "rule", "pending"]),
  date: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  day: z.coerce.number().int().min(1).max(31).optional().nullable(),
  month: z.coerce.number().int().min(1).max(12).optional().nullable(),
  ruleWeekday: z.coerce.number().int().min(1).max(7).optional().nullable(),
  ruleNth: z
    .coerce
    .number()
    .int()
    .refine((n) => n === -1 || (n >= 1 && n <= 4))
    .optional()
    .nullable(),
  ruleMonth: z.coerce.number().int().min(1).max(12).optional().nullable(),
  intervalYears: z.coerce.number().int().min(2).max(50).optional().nullable(),
  anchorYear: z.coerce.number().int().min(2000).max(2100).optional().nullable(),
});

function emptyToNull(value: FormDataEntryValue | null): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length ? s : null;
}

function optionalInt(value: FormDataEntryValue | null): number | null {
  const s = emptyToNull(value);
  if (s == null) return null;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

function parseEventForm(formData: FormData) {
  return eventSchema.safeParse({
    title: formData.get("title"),
    note: emptyToNull(formData.get("note")) ?? undefined,
    categoryId: emptyToNull(formData.get("categoryId")) ?? undefined,
    frequency: formData.get("frequency"),
    dateMode: formData.get("dateMode"),
    date: emptyToNull(formData.get("date")) ?? undefined,
    day: optionalInt(formData.get("day")),
    month: optionalInt(formData.get("month")),
    ruleWeekday: optionalInt(formData.get("ruleWeekday")),
    ruleNth: optionalInt(formData.get("ruleNth")),
    ruleMonth: optionalInt(formData.get("ruleMonth")),
    intervalYears: optionalInt(formData.get("intervalYears")),
    anchorYear: optionalInt(formData.get("anchorYear")),
  });
}

function toFields(data: z.infer<typeof eventSchema>): {
  fields: CalendarEventFields;
  error: string | null;
} {
  const frequency = data.frequency as CalendarFrequency;
  const dateMode = data.dateMode as CalendarDateMode;
  if (!allowedDateModes(frequency).includes(dateMode)) {
    return {
      fields: null as unknown as CalendarEventFields,
      error: "Ungültige Kombination aus Wiederholung und Datumsmodus.",
    };
  }

  let date: Date | null = null;
  if (data.date) {
    date = parseDateKey(data.date);
    if (!date) {
      return {
        fields: null as unknown as CalendarEventFields,
        error: "Ungültiges Datum.",
      };
    }
  }

  const fields: CalendarEventFields = {
    frequency,
    dateMode,
    date,
    day: data.day ?? null,
    month: data.month ?? null,
    ruleWeekday: data.ruleWeekday ?? null,
    ruleNth: data.ruleNth ?? null,
    ruleMonth: data.ruleMonth ?? null,
    intervalYears: data.intervalYears ?? null,
    anchorYear: data.anchorYear ?? null,
  };

  // Clear unused fields for cleaner storage
  if (frequency !== "every_n_years") {
    fields.intervalYears = null;
    fields.anchorYear = null;
  }
  if (frequency === "once") {
    fields.day = null;
    fields.month = null;
    fields.ruleWeekday = null;
    fields.ruleNth = null;
    fields.ruleMonth = null;
  } else if (frequency === "weekly") {
    fields.date = null;
    fields.day = null;
    fields.month = null;
    fields.ruleNth = null;
    fields.ruleMonth = null;
  } else if (dateMode === "pending") {
    fields.date = null;
    fields.day = null;
    // keep month/rule for hints? clear schedule specifics
    fields.day = null;
    fields.ruleWeekday = null;
    fields.ruleNth = null;
    fields.ruleMonth = null;
    if (frequency === "yearly" || frequency === "every_n_years") {
      // month optional hint unused in v1
      fields.month = null;
    }
  }

  const error = validateScheduleFields(fields);
  return { fields, error };
}

async function assertCategory(
  organizationId: string,
  categoryId: string | null,
) {
  if (!categoryId) return null;
  const cat = await prisma.editorialCalendarCategory.findFirst({
    where: { id: categoryId, organizationId, active: true },
    select: { id: true },
  });
  if (!cat) return { error: "Kategorie nicht gefunden." as const };
  return null;
}

/** Optional first-year date when creating/editing a pending event. */
async function upsertOccurrenceFromForm(
  organizationId: string,
  eventId: string,
  dateMode: CalendarDateMode,
  frequency: CalendarFrequency,
  formData: FormData,
): Promise<{ error: string } | null> {
  if (dateMode !== "pending") return null;
  if (frequency !== "yearly" && frequency !== "every_n_years") return null;

  const dateRaw = emptyToNull(formData.get("occurrenceDate"));
  if (!dateRaw) return null;

  const yearRaw = emptyToNull(formData.get("occurrenceYear"));
  const year = yearRaw
    ? Number.parseInt(yearRaw, 10)
    : Number.parseInt(dateRaw.slice(0, 4), 10);

  if (!Number.isFinite(year) || year < 2000 || year > 2100) {
    return { error: "Ungültiges Planungsjahr." };
  }

  const date = parseDateKey(dateRaw);
  if (!date) return { error: "Ungültiges Datum für dieses Jahr." };
  if (date.getUTCFullYear() !== year) {
    return { error: "Das Datum muss im gewählten Jahr liegen." };
  }

  const event = await prisma.editorialCalendarEvent.findFirst({
    where: {
      id: eventId,
      organizationId,
      archivedAt: null,
      dateMode: "pending",
    },
    select: { id: true },
  });
  if (!event) return { error: "Event nicht gefunden." };

  const note = emptyToNull(formData.get("note"));
  await prisma.editorialCalendarOccurrence.upsert({
    where: { eventId_year: { eventId, year } },
    create: { eventId, year, date, note },
    update: { date, note },
  });
  return null;
}

export async function createEditorialCalendarCategory(formData: FormData) {
  const { membership } = await requireMembership();
  const parsed = categorySchema.safeParse({
    name: formData.get("name"),
    color: emptyToNull(formData.get("color")) ?? undefined,
  });
  if (!parsed.success) {
    return { error: "Name (und ggf. Farbe #RRGGBB) prüfen." };
  }

  const maxSort = await prisma.editorialCalendarCategory.aggregate({
    where: { organizationId: membership.organizationId },
    _max: { sortOrder: true },
  });

  try {
    const row = await prisma.editorialCalendarCategory.create({
      data: {
        organizationId: membership.organizationId,
        name: parsed.data.name,
        color: parsed.data.color ?? "#e5e7eb",
        sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
      },
    });
    revalidateCalendar();
    return { ok: true as const, id: row.id };
  } catch {
    return { error: "Kategorie existiert bereits oder konnte nicht erstellt werden." };
  }
}

export async function updateEditorialCalendarCategory(formData: FormData) {
  const { membership } = await requireMembership();
  const id = emptyToNull(formData.get("id"));
  if (!id) return { error: "Fehlende ID." };

  const parsed = categorySchema
    .extend({
      active: z.enum(["true", "false"]).optional(),
    })
    .safeParse({
      name: formData.get("name"),
      color: emptyToNull(formData.get("color")) ?? undefined,
      active: formData.has("active")
        ? String(formData.get("active"))
        : undefined,
    });
  if (!parsed.success) {
    return { error: "Name (und ggf. Farbe #RRGGBB) prüfen." };
  }

  const existing = await prisma.editorialCalendarCategory.findFirst({
    where: { id, organizationId: membership.organizationId },
  });
  if (!existing) return { error: "Kategorie nicht gefunden." };

  try {
    await prisma.editorialCalendarCategory.update({
      where: { id },
      data: {
        name: parsed.data.name,
        ...(parsed.data.color ? { color: parsed.data.color } : {}),
        ...(parsed.data.active !== undefined
          ? { active: parsed.data.active === "true" }
          : {}),
      },
    });
  } catch {
    return { error: "Speichern fehlgeschlagen (Name evtl. doppelt)." };
  }

  revalidateCalendar();
  return { ok: true as const };
}

export async function deleteEditorialCalendarCategory(formData: FormData) {
  const { membership } = await requireMembership();
  const id = emptyToNull(formData.get("id"));
  if (!id) return { error: "Fehlende ID." };

  const existing = await prisma.editorialCalendarCategory.findFirst({
    where: { id, organizationId: membership.organizationId },
  });
  if (!existing) return { error: "Kategorie nicht gefunden." };

  await prisma.editorialCalendarCategory.delete({ where: { id } });
  revalidateCalendar();
  return { ok: true as const };
}

export async function createEditorialCalendarEvent(formData: FormData) {
  const { membership, session } = await requireMembership();
  const parsed = parseEventForm(formData);
  if (!parsed.success) {
    return { error: "Angaben prüfen (Titel, Wiederholung, Datum)." };
  }

  const { fields, error } = toFields(parsed.data);
  if (error) return { error };

  const catErr = await assertCategory(
    membership.organizationId,
    parsed.data.categoryId,
  );
  if (catErr) return catErr;

  const row = await prisma.editorialCalendarEvent.create({
    data: {
      organizationId: membership.organizationId,
      createdById: session.user.id,
      title: parsed.data.title,
      note: parsed.data.note,
      categoryId: parsed.data.categoryId,
      frequency: fields.frequency,
      dateMode: fields.dateMode,
      date: fields.date,
      day: fields.day,
      month: fields.month,
      ruleWeekday: fields.ruleWeekday,
      ruleNth: fields.ruleNth,
      ruleMonth: fields.ruleMonth,
      intervalYears: fields.intervalYears,
      anchorYear: fields.anchorYear,
    },
  });

  const occErr = await upsertOccurrenceFromForm(
    membership.organizationId,
    row.id,
    fields.dateMode,
    fields.frequency,
    formData,
  );
  if (occErr) return occErr;

  revalidateCalendar();
  return { ok: true as const, id: row.id };
}

export async function updateEditorialCalendarEvent(formData: FormData) {
  const { membership } = await requireMembership();
  const id = emptyToNull(formData.get("id"));
  if (!id) return { error: "Fehlende ID." };

  const parsed = parseEventForm(formData);
  if (!parsed.success) {
    return { error: "Angaben prüfen (Titel, Wiederholung, Datum)." };
  }

  const existing = await prisma.editorialCalendarEvent.findFirst({
    where: {
      id,
      organizationId: membership.organizationId,
      archivedAt: null,
    },
  });
  if (!existing) return { error: "Event nicht gefunden." };

  const { fields, error } = toFields(parsed.data);
  if (error) return { error };

  const catErr = await assertCategory(
    membership.organizationId,
    parsed.data.categoryId,
  );
  if (catErr) return catErr;

  await prisma.editorialCalendarEvent.update({
    where: { id },
    data: {
      title: parsed.data.title,
      note: parsed.data.note,
      categoryId: parsed.data.categoryId,
      frequency: fields.frequency,
      dateMode: fields.dateMode,
      date: fields.date,
      day: fields.day,
      month: fields.month,
      ruleWeekday: fields.ruleWeekday,
      ruleNth: fields.ruleNth,
      ruleMonth: fields.ruleMonth,
      intervalYears: fields.intervalYears,
      anchorYear: fields.anchorYear,
    },
  });

  const occErr = await upsertOccurrenceFromForm(
    membership.organizationId,
    id,
    fields.dateMode,
    fields.frequency,
    formData,
  );
  if (occErr) return occErr;

  revalidateCalendar();
  return { ok: true as const };
}

export async function archiveEditorialCalendarEvent(formData: FormData) {
  const { membership } = await requireMembership();
  const id = emptyToNull(formData.get("id"));
  if (!id) return { error: "Fehlende ID." };

  const existing = await prisma.editorialCalendarEvent.findFirst({
    where: {
      id,
      organizationId: membership.organizationId,
      archivedAt: null,
    },
  });
  if (!existing) return { error: "Event nicht gefunden." };

  await prisma.editorialCalendarEvent.update({
    where: { id },
    data: { archivedAt: new Date() },
  });

  revalidateCalendar();
  return { ok: true as const };
}

export async function setEditorialCalendarPendingDate(formData: FormData) {
  const { membership } = await requireMembership();
  const eventId = emptyToNull(formData.get("eventId"));
  const yearRaw = emptyToNull(formData.get("year"));
  const dateRaw = emptyToNull(formData.get("date"));
  const note = emptyToNull(formData.get("note"));

  if (!eventId || !yearRaw || !dateRaw) {
    return { error: "Event, Jahr und Datum nötig." };
  }

  const year = Number.parseInt(yearRaw, 10);
  if (!Number.isFinite(year) || year < 2000 || year > 2100) {
    return { error: "Ungültiges Jahr." };
  }

  const date = parseDateKey(dateRaw);
  if (!date) return { error: "Ungültiges Datum." };
  if (date.getUTCFullYear() !== year) {
    return { error: "Datum muss im gewählten Jahr liegen." };
  }

  const event = await prisma.editorialCalendarEvent.findFirst({
    where: {
      id: eventId,
      organizationId: membership.organizationId,
      archivedAt: null,
      dateMode: "pending",
      frequency: { in: ["yearly", "every_n_years"] },
    },
  });
  if (!event) return { error: "Event nicht gefunden oder nicht einplanbar." };

  await prisma.editorialCalendarOccurrence.upsert({
    where: { eventId_year: { eventId, year } },
    create: {
      eventId,
      year,
      date,
      note,
    },
    update: {
      date,
      note,
    },
  });

  revalidateCalendar();
  return { ok: true as const };
}

export async function clearEditorialCalendarPendingDate(formData: FormData) {
  const { membership } = await requireMembership();
  const eventId = emptyToNull(formData.get("eventId"));
  const yearRaw = emptyToNull(formData.get("year"));
  if (!eventId || !yearRaw) return { error: "Event und Jahr nötig." };

  const year = Number.parseInt(yearRaw, 10);
  if (!Number.isFinite(year)) return { error: "Ungültiges Jahr." };

  const event = await prisma.editorialCalendarEvent.findFirst({
    where: {
      id: eventId,
      organizationId: membership.organizationId,
      archivedAt: null,
    },
    select: { id: true },
  });
  if (!event) return { error: "Event nicht gefunden." };

  await prisma.editorialCalendarOccurrence.deleteMany({
    where: { eventId, year },
  });

  revalidateCalendar();
  return { ok: true as const };
}
