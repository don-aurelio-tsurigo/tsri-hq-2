"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CampaignStatus, CreativeType } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { requireCivicMediaAccess } from "@/lib/session";

const createSchema = z.object({
  name: z.string().min(1).max(200),
  type: z.enum(["IMAGE", "VIDEO"]),
  mediaUrl: z.string().min(1).max(2000),
  targetUrl: z.string().min(1).max(2000),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  impressionLimit: z.string().optional(),
});

function parseDayStart(isoDate: string): Date {
  const d = new Date(`${isoDate}T00:00:00.000`);
  return d;
}

function parseDayEnd(isoDate: string): Date {
  const d = new Date(`${isoDate}T23:59:59.999`);
  return d;
}

/** Empty → null (unlimited); otherwise positive int. */
function parseImpressionLimit(
  raw: string | undefined,
): { ok: true; value: number | null } | { ok: false; error: string } {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { ok: true, value: null };
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n < 1) {
    return { ok: false, error: "Impression-Limit muss eine ganze Zahl ≥ 1 sein." };
  }
  return { ok: true, value: n };
}

export async function createAdCampaign(formData: FormData) {
  await requireCivicMediaAccess();

  const parsed = createSchema.safeParse({
    name: String(formData.get("name") ?? "").trim(),
    type: String(formData.get("type") ?? ""),
    mediaUrl: String(formData.get("mediaUrl") ?? "").trim(),
    targetUrl: String(formData.get("targetUrl") ?? "").trim(),
    startDate: String(formData.get("startDate") ?? ""),
    endDate: String(formData.get("endDate") ?? ""),
    impressionLimit: String(formData.get("impressionLimit") ?? ""),
  });
  if (!parsed.success) {
    return { error: "Bitte alle Felder ausfüllen." };
  }

  const { name, type, mediaUrl, targetUrl, startDate, endDate } = parsed.data;
  const limitParsed = parseImpressionLimit(parsed.data.impressionLimit);
  if (!limitParsed.ok) return { error: limitParsed.error };

  const start = parseDayStart(startDate);
  const end = parseDayEnd(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { error: "Ungültiges Datum." };
  }
  if (end < start) {
    return { error: "Enddatum muss nach dem Startdatum liegen." };
  }

  await prisma.campaign.create({
    data: {
      name,
      startDate: start,
      endDate: end,
      status: CampaignStatus.ACTIVE,
      impressionLimit: limitParsed.value,
      creatives: {
        create: {
          type: type as CreativeType,
          mediaUrl,
          targetUrl,
        },
      },
    },
  });

  revalidatePath("/ads");
  return { ok: true as const };
}

export async function toggleAdCampaignStatus(formData: FormData) {
  await requireCivicMediaAccess();

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Ungültige ID." };

  const existing = await prisma.campaign.findUnique({
    where: { id },
    select: { status: true },
  });
  if (!existing) return { error: "Kampagne nicht gefunden." };

  await prisma.campaign.update({
    where: { id },
    data: {
      status:
        existing.status === CampaignStatus.ACTIVE
          ? CampaignStatus.PAUSED
          : CampaignStatus.ACTIVE,
    },
  });

  revalidatePath("/ads");
  return { ok: true as const };
}

const updateSchema = z.object({
  id: z.string().min(1),
  targetUrl: z.string().min(1).max(2000),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  impressionLimit: z.string().optional(),
});

export async function updateAdCampaign(formData: FormData) {
  await requireCivicMediaAccess();

  const parsed = updateSchema.safeParse({
    id: String(formData.get("id") ?? ""),
    targetUrl: String(formData.get("targetUrl") ?? "").trim(),
    startDate: String(formData.get("startDate") ?? ""),
    endDate: String(formData.get("endDate") ?? ""),
    impressionLimit: String(formData.get("impressionLimit") ?? ""),
  });
  if (!parsed.success) {
    return { error: "Bitte Ziel-URL und Daten ausfüllen." };
  }

  const { id, targetUrl, startDate, endDate } = parsed.data;
  const limitParsed = parseImpressionLimit(parsed.data.impressionLimit);
  if (!limitParsed.ok) return { error: limitParsed.error };

  const start = parseDayStart(startDate);
  const end = parseDayEnd(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { error: "Ungültiges Datum." };
  }
  if (end < start) {
    return { error: "Enddatum muss nach dem Startdatum liegen." };
  }

  const existing = await prisma.campaign.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) return { error: "Kampagne nicht gefunden." };

  await prisma.$transaction([
    prisma.campaign.update({
      where: { id },
      data: {
        startDate: start,
        endDate: end,
        impressionLimit: limitParsed.value,
      },
    }),
    prisma.creative.updateMany({
      where: { campaignId: id },
      data: { targetUrl },
    }),
  ]);

  revalidatePath("/ads");
  return { ok: true as const };
}
