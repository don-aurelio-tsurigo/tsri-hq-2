import { MemberUsageKind } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";

export type QuotaKind = "ai" | "rag_search" | "image_proxy";

type QuotaSpec = {
  max: number;
  windowMinutes: number;
  label: string;
};

const DEFAULTS: Record<QuotaKind, QuotaSpec> = {
  ai: { max: 30, windowMinutes: 60, label: "KI-Generierungen" },
  rag_search: { max: 30, windowMinutes: 60, label: "RAG-Suchen" },
  image_proxy: { max: 80, windowMinutes: 60, label: "Bild-Proxy-Aufrufe" },
};

function envInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

function specFor(kind: QuotaKind): QuotaSpec {
  const base = DEFAULTS[kind];
  const prefix =
    kind === "ai"
      ? "MEMBER_QUOTA_AI"
      : kind === "rag_search"
        ? "MEMBER_QUOTA_RAG"
        : "MEMBER_QUOTA_PROXY";
  return {
    max: envInt(`${prefix}_MAX`, base.max),
    windowMinutes: envInt(
      "MEMBER_QUOTA_WINDOW_MINUTES",
      envInt(`${prefix}_WINDOW_MINUTES`, base.windowMinutes),
    ),
    label: base.label,
  };
}

export type QuotaResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

/** Record one use if the member is under the rolling-window cap. */
export async function consumeMemberQuota(
  userId: string,
  kind: QuotaKind,
  options?: { max?: number },
): Promise<QuotaResult> {
  const spec = specFor(kind);
  const max = options?.max ?? spec.max;
  const windowStart = new Date(Date.now() - spec.windowMinutes * 60_000);
  const prismaKind = kind as MemberUsageKind;

  await prisma.memberUsage.deleteMany({
    where: { userId, kind: prismaKind, createdAt: { lt: windowStart } },
  });

  const used = await prisma.memberUsage.count({
    where: { userId, kind: prismaKind, createdAt: { gte: windowStart } },
  });
  if (used >= max) {
    const oldest = await prisma.memberUsage.findFirst({
      where: { userId, kind: prismaKind, createdAt: { gte: windowStart } },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    });
    const retryMs = oldest
      ? oldest.createdAt.getTime() + spec.windowMinutes * 60_000 - Date.now()
      : spec.windowMinutes * 60_000;
    const retryMin = Math.max(1, Math.ceil(retryMs / 60_000));
    return {
      ok: false,
      error: `Limit erreicht: maximal ${max} ${spec.label} pro ${spec.windowMinutes} Min. Wieder in ca. ${retryMin} Min.`,
    };
  }

  const row = await prisma.memberUsage.create({
    data: { userId, kind: prismaKind },
    select: { id: true },
  });
  return { ok: true, id: row.id };
}

/** Drop a recorded use after an upstream failure so the slot is not burned. */
export async function refundMemberQuota(id: string): Promise<void> {
  await prisma.memberUsage.delete({ where: { id } }).catch(() => undefined);
}
