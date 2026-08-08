"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireMembership } from "@/lib/session";
import {
  isTimeEntryType,
  isTimeSegmentKind,
  parseTimeToMinutes,
  segmentsOverlap,
} from "@/lib/time-tracking-constants";

// ─── Arbeitszeit ───────────────────────────────────────────────

const upsertTimeEntrySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: z.string(),
  note: z.string().max(500).optional(),
  /** JSON array of { type: work|break, startTime, endTime } */
  segments: z.string().optional(),
});

function normalizeTimeInput(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const mins = parseTimeToMinutes(value.trim());
  if (mins === null) return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

type ParsedSegment = {
  type: "work" | "break";
  startTime: string;
  endTime: string;
};

function parseSegmentsJson(raw: string | undefined): ParsedSegment[] | { error: string } {
  if (!raw?.trim()) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { error: "Segmente ungültig." };
  }
  if (!Array.isArray(data)) return { error: "Segmente ungültig." };

  const segments: ParsedSegment[] = [];
  for (const item of data) {
    if (!item || typeof item !== "object") {
      return { error: "Segment ungültig." };
    }
    const kindRaw = String((item as { type?: unknown }).type ?? "work");
    if (!isTimeSegmentKind(kindRaw)) {
      return { error: "Segment-Typ ungültig." };
    }
    const startNorm = normalizeTimeInput(
      String((item as { startTime?: unknown }).startTime ?? ""),
    );
    const endNorm = normalizeTimeInput(
      String((item as { endTime?: unknown }).endTime ?? ""),
    );
    if (!startNorm) return { error: "Beginn ungültig (HH:MM)." };
    if (!endNorm) return { error: "Schluss ungültig (HH:MM)." };
    segments.push({ type: kindRaw, startTime: startNorm, endTime: endNorm });
  }
  return segments;
}

export async function upsertTimeEntry(formData: FormData) {
  const { session, membership } = await requireMembership();
  const parsed = upsertTimeEntrySchema.safeParse({
    date: formData.get("date"),
    type: formData.get("type") || "work",
    note: formData.get("note") || undefined,
    segments: formData.get("segments")?.toString() || undefined,
  });
  if (!parsed.success || !isTimeEntryType(parsed.data.type)) {
    return { error: "Bitte Eintrag prüfen." };
  }

  const type = parsed.data.type;
  const isAbsent = type === "sick" || type === "vacation" || type === "holiday";

  let segments: ParsedSegment[] = [];

  if (!isAbsent) {
    const parsedSegs = parseSegmentsJson(parsed.data.segments);
    if ("error" in parsedSegs) return parsedSegs;
    segments = parsedSegs;

    if (!segments.some((s) => s.type === "work")) {
      return { error: "Mindestens ein Arbeitssegment nötig." };
    }
    if (segmentsOverlap(segments)) {
      return { error: "Segmente desselben Typs überschneiden sich." };
    }
  }

  const date = new Date(`${parsed.data.date}T12:00:00.000Z`);

  const entry = await prisma.timeEntry.upsert({
    where: {
      organizationId_userId_date: {
        organizationId: membership.organizationId,
        userId: session.user.id,
        date,
      },
    },
    create: {
      organizationId: membership.organizationId,
      userId: session.user.id,
      date,
      type,
      note: parsed.data.note?.trim() || null,
    },
    update: {
      type,
      note: parsed.data.note?.trim() || null,
    },
  });

  await prisma.timeSegment.deleteMany({ where: { timeEntryId: entry.id } });

  if (!isAbsent && segments.length > 0) {
    const ordered = segments
      .slice()
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
    await prisma.timeSegment.createMany({
      data: ordered.map((s, index) => ({
        timeEntryId: entry.id,
        type: s.type,
        startTime: s.startTime,
        endTime: s.endTime,
        sortOrder: index,
      })),
    });
  }

  revalidatePath("/hours");
  revalidatePath("/home");
  revalidatePath("/settings/hours");
  return { ok: true as const };
}

export async function deleteTimeEntry(formData: FormData) {
  const { session, membership } = await requireMembership();
  const dateKey = String(formData.get("date") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    return { error: "Ungültiges Datum." };
  }

  await prisma.timeEntry.deleteMany({
    where: {
      organizationId: membership.organizationId,
      userId: session.user.id,
      date: new Date(`${dateKey}T12:00:00.000Z`),
    },
  });

  revalidatePath("/hours");
  revalidatePath("/home");
  return { ok: true as const };
}
