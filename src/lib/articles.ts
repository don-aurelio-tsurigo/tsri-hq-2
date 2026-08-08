import { prisma } from "@/lib/db";
import { toDateKey } from "@/lib/cooking";
import type { ArticleStage } from "@/lib/editorial";

export type ArticleRow = Awaited<ReturnType<typeof listArticles>>[number];

/** All articles (full editorial database, incl. published + soft-archived). */
export async function listArticles(spaceId: string) {
  return prisma.article.findMany({
    where: { spaceId },
    include: {
      assignee: { select: { id: true, name: true, email: true } },
      createdBy: { select: { id: true, name: true } },
      eigenleistungRubrik: {
        select: { id: true, name: true, color: true },
      },
      category: {
        select: { id: true, name: true, color: true, active: true },
      },
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
  });
}

const MY_HOME_ARTICLE_STAGES = [
  "weiter",
  "in_arbeit",
  "bereit",
  "publiziert",
] as const satisfies readonly ArticleStage[];

/**
 * Home "Meine Artikel": assigned, stage ab Weiter (ohne Input/Warteliste/Abgelehnt),
 * mit Publikationsdatum ab heute.
 */
export async function listMyHomeArticles(
  organizationId: string,
  userId: string,
) {
  const todayKey = toDateKey(new Date());
  const dayStart = new Date(`${todayKey}T00:00:00.000Z`);

  return prisma.article.findMany({
    where: {
      archivedAt: null,
      stage: { in: [...MY_HOME_ARTICLE_STAGES] },
      publishAt: { gte: dayStart },
      space: {
        organizationId,
        type: { not: "personal" },
        isTemplate: false,
        archivedAt: null,
      },
      assigneeId: userId,
    },
    include: {
      space: true,
      assignee: { select: { id: true, name: true, email: true } },
    },
    orderBy: [{ publishAt: "asc" }, { updatedAt: "desc" }],
  });
}
