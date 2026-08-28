"use server";

import { revalidatePath } from "next/cache";
import { endOfMonth, format, startOfMonth } from "date-fns";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { membershipInTagPool } from "@/lib/membership-grants";
import { requireEditorialLead, requireMembership } from "@/lib/session";
import {
  BRIEFING_TYPE_NAME,
  COUNCIL_TYPE_NAME,
  ensureShiftPlanTypes,
  listShiftPlanTypes,
} from "@/lib/shift-plan";
import {
  generateProposal,
  type SolverExisting,
  type SolverMember,
  type SolverQuota,
  type SolverType,
  type SolverVacation,
} from "@/lib/shift-plan-solver";
import { scheduledDateKeysInMonth } from "@/lib/newsletter-constants";

function revalidateShiftPaths() {
  revalidatePath("/schichtplan");
  revalidatePath("/settings/schichtplan");
  revalidatePath("/newsletter");
}

const quotaSchema = z.object({
  userId: z.string().min(1),
  newsletterTypeId: z.string().min(1),
  minCount: z.coerce.number().int().min(0).max(31),
  maxCount: z.coerce.number().int().min(0).max(31),
  isFixed: z
    .union([z.literal("true"), z.literal("on"), z.literal("false"), z.null()])
    .optional()
    .transform((v) => v === "true" || v === "on"),
});

export async function upsertShiftQuota(formData: FormData) {
  const { membership } = await requireEditorialLead();
  const parsed = quotaSchema.safeParse({
    userId: formData.get("userId"),
    newsletterTypeId: formData.get("newsletterTypeId"),
    minCount: formData.get("minCount"),
    maxCount: formData.get("maxCount"),
    isFixed: formData.get("isFixed") ?? null,
  });
  if (!parsed.success) {
    return { error: "Person, Typ und Anzahlen prüfen." };
  }
  if (parsed.data.maxCount < parsed.data.minCount) {
    return { error: "Maximum darf nicht kleiner als Minimum sein." };
  }
  if (parsed.data.isFixed && parsed.data.minCount !== parsed.data.maxCount) {
    return { error: "Fixquote: Minimum und Maximum müssen gleich sein." };
  }

  const type = await prisma.newsletterType.findFirst({
    where: {
      id: parsed.data.newsletterTypeId,
      organizationId: membership.organizationId,
      active: true,
    },
  });
  if (!type) return { error: "Schichttyp nicht gefunden." };

  const member = await prisma.membership.findUnique({
    where: {
      organizationId_userId: {
        organizationId: membership.organizationId,
        userId: parsed.data.userId,
      },
    },
  });
  if (!member || member.archivedAt) {
    return { error: "Person nicht im Team." };
  }

  await prisma.shiftQuota.upsert({
    where: {
      organizationId_userId_newsletterTypeId: {
        organizationId: membership.organizationId,
        userId: parsed.data.userId,
        newsletterTypeId: parsed.data.newsletterTypeId,
      },
    },
    create: {
      organizationId: membership.organizationId,
      userId: parsed.data.userId,
      newsletterTypeId: parsed.data.newsletterTypeId,
      minCount: parsed.data.minCount,
      maxCount: parsed.data.maxCount,
      isFixed: parsed.data.isFixed,
    },
    update: {
      minCount: parsed.data.minCount,
      maxCount: parsed.data.maxCount,
      isFixed: parsed.data.isFixed,
    },
  });

  revalidateShiftPaths();
  return { ok: true as const };
}

export async function deleteShiftQuota(formData: FormData) {
  const { membership } = await requireEditorialLead();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Fehlende ID." };

  const row = await prisma.shiftQuota.findFirst({
    where: { id, organizationId: membership.organizationId },
  });
  if (!row) return { error: "Quote nicht gefunden." };

  await prisma.shiftQuota.delete({ where: { id } });
  revalidateShiftPaths();
  return { ok: true as const };
}

const quotaEntrySchema = z.object({
  newsletterTypeId: z.string().min(1),
  mode: z.enum(["open", "off", "fixed", "range"]),
  minCount: z.number().int().min(0).max(31).optional(),
  maxCount: z.number().int().min(0).max(31).optional(),
});

const saveMemberQuotasSchema = z.object({
  userId: z.string().min(1),
  restrictedProfile: z.boolean(),
  entries: z.array(quotaEntrySchema),
});

export async function saveMemberShiftQuotas(formData: FormData) {
  const { membership } = await requireEditorialLead();
  const raw = formData.get("payload");
  if (typeof raw !== "string" || raw.length === 0) {
    return { error: "Ungültige Daten." };
  }

  let parsed: z.infer<typeof saveMemberQuotasSchema>;
  try {
    parsed = saveMemberQuotasSchema.parse(JSON.parse(raw));
  } catch {
    return { error: "Ungültige Daten." };
  }

  const member = await prisma.membership.findUnique({
    where: {
      organizationId_userId: {
        organizationId: membership.organizationId,
        userId: parsed.userId,
      },
    },
  });
  if (!member || member.archivedAt) {
    return { error: "Person nicht im Team." };
  }

  const types = await prisma.newsletterType.findMany({
    where: {
      organizationId: membership.organizationId,
      active: true,
    },
    select: { id: true },
  });
  const typeIds = new Set(types.map((t) => t.id));

  if (parsed.restrictedProfile && parsed.entries.length !== types.length) {
    return { error: "Begrenztes Profil: alle Schichttypen müssen gesetzt sein." };
  }

  for (const entry of parsed.entries) {
    if (!typeIds.has(entry.newsletterTypeId)) {
      return { error: "Unbekannter Schichttyp." };
    }

    let mode = entry.mode;
    if (parsed.restrictedProfile && mode === "open") {
      mode = "off";
    }

    if (!parsed.restrictedProfile && mode === "open") {
      await prisma.shiftQuota.deleteMany({
        where: {
          organizationId: membership.organizationId,
          userId: parsed.userId,
          newsletterTypeId: entry.newsletterTypeId,
        },
      });
      continue;
    }

    let minCount = 0;
    let maxCount = 0;
    let isFixed = true;

    if (mode === "off") {
      minCount = 0;
      maxCount = 0;
      isFixed = true;
    } else if (mode === "fixed") {
      const count = entry.minCount ?? entry.maxCount;
      if (count == null) return { error: "Anzahl fehlt." };
      minCount = count;
      maxCount = count;
      isFixed = true;
    } else if (mode === "range") {
      if (entry.minCount == null || entry.maxCount == null) {
        return { error: "Min/Max fehlen." };
      }
      minCount = entry.minCount;
      maxCount = entry.maxCount;
      isFixed = false;
    } else {
      continue;
    }

    if (maxCount < minCount) {
      return { error: "Maximum darf nicht kleiner als Minimum sein." };
    }

    await prisma.shiftQuota.upsert({
      where: {
        organizationId_userId_newsletterTypeId: {
          organizationId: membership.organizationId,
          userId: parsed.userId,
          newsletterTypeId: entry.newsletterTypeId,
        },
      },
      create: {
        organizationId: membership.organizationId,
        userId: parsed.userId,
        newsletterTypeId: entry.newsletterTypeId,
        minCount,
        maxCount,
        isFixed,
      },
      update: {
        minCount,
        maxCount,
        isFixed,
      },
    });
  }

  revalidateShiftPaths();
  return { ok: true as const };
}

export async function clearMemberShiftQuotas(formData: FormData) {
  const { membership } = await requireEditorialLead();
  const userId = String(formData.get("userId") ?? "");
  if (!userId) return { error: "Person fehlt." };

  await prisma.shiftQuota.deleteMany({
    where: {
      organizationId: membership.organizationId,
      userId,
    },
  });

  revalidateShiftPaths();
  return { ok: true as const };
}

const councilStubSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z
    .string()
    .trim()
    .max(500)
    .transform((v) => (v.length === 0 ? null : v)),
});

export async function createCouncilSessionStub(formData: FormData) {
  const { session, membership } = await requireEditorialLead();
  await ensureShiftPlanTypes(membership.organizationId);

  const parsed = councilStubSchema.safeParse({
    date: formData.get("date"),
    note: formData.get("note") ?? "",
  });
  if (!parsed.success) return { error: "Datum prüfen." };

  const council = await prisma.newsletterType.findFirst({
    where: {
      organizationId: membership.organizationId,
      name: COUNCIL_TYPE_NAME,
      active: true,
    },
  });
  if (!council) return { error: "Gemeinderats-Briefing-Typ fehlt." };

  const date = new Date(`${parsed.data.date}T12:00:00.000Z`);
  const existing = await prisma.newsletterCampaign.findFirst({
    where: { typeId: council.id, date },
  });
  if (existing) {
    if (existing.status === "skipped") {
      await prisma.newsletterCampaign.update({
        where: { id: existing.id },
        data: {
          status: "planned",
          authorId: null,
          note: parsed.data.note,
        },
      });
      revalidateShiftPaths();
      return { ok: true as const, id: existing.id };
    }
    return { error: "Für dieses Datum gibt es schon einen Termin." };
  }

  const created = await prisma.newsletterCampaign.create({
    data: {
      typeId: council.id,
      authorId: null,
      createdById: session.user.id,
      date,
      status: "planned",
      note: parsed.data.note,
    },
  });

  revalidateShiftPaths();
  return { ok: true as const, id: created.id };
}

export async function markCouncilSessionSkipped(formData: FormData) {
  const { membership } = await requireEditorialLead();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Fehlende ID." };

  const campaign = await prisma.newsletterCampaign.findUnique({
    where: { id },
    include: { type: true },
  });
  if (
    !campaign ||
    campaign.type.organizationId !== membership.organizationId ||
    campaign.type.name !== COUNCIL_TYPE_NAME
  ) {
    return { error: "Sitzungstermin nicht gefunden." };
  }

  await prisma.newsletterCampaign.update({
    where: { id },
    data: { status: "skipped" },
  });

  revalidateShiftPaths();
  return { ok: true as const };
}

const monthSchema = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000).max(2100),
});

export async function generateShiftPlanProposal(formData: FormData) {
  const { session, membership } = await requireEditorialLead();
  await ensureShiftPlanTypes(membership.organizationId);

  const parsed = monthSchema.safeParse({
    month: formData.get("month"),
    year: formData.get("year"),
  });
  if (!parsed.success) return { error: "Monat und Jahr prüfen." };

  const { month, year } = parsed.data;
  const monthStart = startOfMonth(new Date(year, month - 1, 1));
  const monthEnd = endOfMonth(monthStart);
  const dateFrom = new Date(
    `${format(monthStart, "yyyy-MM-dd")}T12:00:00.000Z`,
  );
  const dateTo = new Date(`${format(monthEnd, "yyyy-MM-dd")}T12:00:00.000Z`);

  const [types, editorialMembers, quotas, vacations, campaigns] =
    await Promise.all([
      listShiftPlanTypes(membership.organizationId),
      prisma.membership.findMany({
        where: {
          organizationId: membership.organizationId,
          archivedAt: null,
          grants: {
            some: {
              capability: { in: ["editorial", "editorial_lead"] },
            },
          },
        },
        include: { user: { select: { id: true, name: true } } },
        orderBy: { user: { name: "asc" } },
      }),
      prisma.shiftQuota.findMany({
        where: { organizationId: membership.organizationId },
      }),
      prisma.vacationRequest.findMany({
        where: {
          organizationId: membership.organizationId,
          status: "approved",
          startDate: { lte: dateTo },
          endDate: { gte: dateFrom },
        },
      }),
      prisma.newsletterCampaign.findMany({
        where: {
          type: { organizationId: membership.organizationId, active: true },
          date: { gte: dateFrom, lte: dateTo },
        },
        include: { type: { select: { id: true, name: true } } },
      }),
    ]);

  const briefingType = types.find((t) => t.name === BRIEFING_TYPE_NAME);
  const councilType = types.find((t) => t.name === COUNCIL_TYPE_NAME);

  const solverTypes: SolverType[] = types.map((t) => {
    let slotDateKeys: string[];
    if (t.schedulingMode === "manualDates") {
      // Non-skipped stubs (incl. empty planned / with author / proposed)
      slotDateKeys = campaigns
        .filter((c) => c.typeId === t.id && c.status !== "skipped")
        .map((c) => c.date.toISOString().slice(0, 10));
      slotDateKeys = [...new Set(slotDateKeys)].sort();
    } else {
      slotDateKeys = scheduledDateKeysInMonth(t.weekdays, year, month - 1);
    }
    return {
      id: t.id,
      name: t.name,
      isEveningShift: t.isEveningShift,
      schedulingMode: t.schedulingMode,
      slotDateKeys,
    };
  });

  const solverMembers: SolverMember[] = editorialMembers.map((m) => ({
    userId: m.userId,
    name: m.user.name,
    fixedDayOff: m.fixedDayOff,
  }));

  const solverQuotas: SolverQuota[] = quotas.map((q) => ({
    userId: q.userId,
    typeId: q.newsletterTypeId,
    minCount: q.minCount,
    maxCount: q.maxCount,
    isFixed: q.isFixed,
  }));

  const solverVacations: SolverVacation[] = vacations.map((v) => ({
    userId: v.userId,
    startKey: v.startDate.toISOString().slice(0, 10),
    endKey: v.endDate.toISOString().slice(0, 10),
  }));

  const solverExisting: SolverExisting[] = campaigns.map((c) => ({
    userId: c.authorId,
    typeId: c.typeId,
    dateKey: c.date.toISOString().slice(0, 10),
    status: c.status,
  }));

  const { assignments, warnings } = generateProposal({
    year,
    month,
    types: solverTypes,
    members: solverMembers,
    quotas: solverQuotas,
    vacations: solverVacations,
    existing: solverExisting,
    briefingTypeId: briefingType?.id ?? null,
    councilTypeId: councilType?.id ?? null,
  });

  // Replace existing proposed rows in month (keep council date stubs as empty planned)
  const proposedRows = await prisma.newsletterCampaign.findMany({
    where: {
      type: { organizationId: membership.organizationId },
      status: "proposed",
      date: { gte: dateFrom, lte: dateTo },
    },
    include: { type: { select: { name: true } } },
  });
  for (const row of proposedRows) {
    if (row.type.name === COUNCIL_TYPE_NAME) {
      await prisma.newsletterCampaign.update({
        where: { id: row.id },
        data: { status: "planned", authorId: null },
      });
    } else {
      await prisma.newsletterCampaign.delete({ where: { id: row.id } });
    }
  }

  if (assignments.length > 0) {
    for (const a of assignments) {
      const date = new Date(`${a.dateKey}T12:00:00.000Z`);
      const existing = await prisma.newsletterCampaign.findFirst({
        where: {
          typeId: a.typeId,
          date,
          status: { not: "proposed" },
        },
      });
      if (existing) {
        // Update author on empty planned stub (e.g. council), mark as proposal
        if (!existing.authorId && existing.status !== "skipped") {
          await prisma.newsletterCampaign.update({
            where: { id: existing.id },
            data: { authorId: a.userId, status: "proposed" },
          });
        }
        continue;
      }
      await prisma.newsletterCampaign.create({
        data: {
          typeId: a.typeId,
          authorId: a.userId,
          createdById: session.user.id,
          date,
          status: "proposed",
        },
      });
    }
  }

  revalidateShiftPaths();
  return {
    ok: true as const,
    created: assignments.length,
    warnings,
  };
}

export async function confirmShiftPlanMonth(formData: FormData) {
  const { membership } = await requireEditorialLead();
  const parsed = monthSchema.safeParse({
    month: formData.get("month"),
    year: formData.get("year"),
  });
  if (!parsed.success) return { error: "Monat und Jahr prüfen." };

  const monthStart = startOfMonth(
    new Date(parsed.data.year, parsed.data.month - 1, 1),
  );
  const monthEnd = endOfMonth(monthStart);

  const result = await prisma.newsletterCampaign.updateMany({
    where: {
      type: { organizationId: membership.organizationId },
      status: "proposed",
      date: {
        gte: new Date(
          `${format(monthStart, "yyyy-MM-dd")}T12:00:00.000Z`,
        ),
        lte: new Date(`${format(monthEnd, "yyyy-MM-dd")}T12:00:00.000Z`),
      },
    },
    data: { status: "planned" },
  });

  revalidateShiftPaths();
  return { ok: true as const, count: result.count };
}

const shiftSlotSchema = z.object({
  typeId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  authorId: z
    .string()
    .trim()
    .transform((v) => (v.length === 0 ? null : v)),
});

async function resolveShiftAuthor(
  organizationId: string,
  authorId: string | null,
  currentAuthorId?: string | null,
) {
  if (!authorId) return { ok: true as const, authorId: null };
  const authorMembership = await prisma.membership.findUnique({
    where: {
      organizationId_userId: { organizationId, userId: authorId },
    },
  });
  if (!authorMembership || authorMembership.archivedAt) {
    return { ok: false as const, error: "Person ist nicht im Team." };
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
    return { ok: false as const, error: "Person ist nicht in der Redaktion." };
  }
  return { ok: true as const, authorId };
}

export async function upsertShiftSlot(formData: FormData) {
  const { session, membership } = await requireMembership();
  const parsed = shiftSlotSchema.safeParse({
    typeId: formData.get("typeId"),
    date: formData.get("date"),
    authorId: formData.get("authorId") ?? "",
  });
  if (!parsed.success) return { error: "Typ, Datum und Person prüfen." };

  const type = await prisma.newsletterType.findFirst({
    where: {
      id: parsed.data.typeId,
      organizationId: membership.organizationId,
      active: true,
    },
  });
  if (!type) return { error: "Schichttyp nicht gefunden." };

  const date = new Date(`${parsed.data.date}T12:00:00.000Z`);
  const existing = await prisma.newsletterCampaign.findFirst({
    where: { typeId: type.id, date },
  });

  const author = await resolveShiftAuthor(
    membership.organizationId,
    parsed.data.authorId,
    existing?.authorId,
  );
  if (!author.ok) return { error: author.error };

  // Hard rule: max 1 assignment per person/day
  if (author.authorId) {
    const clash = await prisma.newsletterCampaign.findFirst({
      where: {
        authorId: author.authorId,
        date,
        status: { not: "skipped" },
        ...(existing ? { NOT: { id: existing.id } } : {}),
        type: { organizationId: membership.organizationId },
      },
    });
    if (clash) {
      return {
        error:
          "Diese Person hat an diesem Tag schon einen Einsatz (max. 1/Tag).",
      };
    }
  }

  const keepProposed = existing?.status === "proposed";
  const status = keepProposed
    ? "proposed"
    : author.authorId
      ? "planned"
      : "planned";

  if (existing) {
    await prisma.newsletterCampaign.update({
      where: { id: existing.id },
      data: {
        authorId: author.authorId,
        status: existing.status === "skipped" ? "planned" : status,
      },
    });
  } else {
    await prisma.newsletterCampaign.create({
      data: {
        typeId: type.id,
        authorId: author.authorId,
        createdById: session.user.id,
        date,
        status: "planned",
      },
    });
  }

  revalidateShiftPaths();
  return { ok: true as const };
}

export async function clearShiftSlot(formData: FormData) {
  const { membership } = await requireMembership();
  const campaignId = String(formData.get("id") ?? "");
  const typeId = String(formData.get("typeId") ?? "");
  const dateKey = String(formData.get("date") ?? "");

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
    // Council stubs: clear author but keep date row unless proposed
    if (
      campaign.type.name === COUNCIL_TYPE_NAME &&
      campaign.status !== "proposed"
    ) {
      await prisma.newsletterCampaign.update({
        where: { id: campaign.id },
        data: { authorId: null, status: "planned" },
      });
    } else {
      await prisma.newsletterCampaign.delete({ where: { id: campaign.id } });
    }
    revalidateShiftPaths();
    return { ok: true as const };
  }

  if (!typeId || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    return { error: "Typ und Datum fehlen." };
  }

  await prisma.newsletterCampaign.deleteMany({
    where: {
      typeId,
      date: new Date(`${dateKey}T12:00:00.000Z`),
      type: { organizationId: membership.organizationId },
    },
  });
  revalidateShiftPaths();
  return { ok: true as const };
}
