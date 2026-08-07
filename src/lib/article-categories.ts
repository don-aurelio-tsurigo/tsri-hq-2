import { prisma } from "@/lib/db";

/** Default Redaktions-Kategorien (bisheriges Enum + Programm-Farben). */
export const DEFAULT_ARTICLE_CATEGORIES: {
  legacyKey: string;
  name: string;
  color: string;
}[] = [
  { legacyKey: "nuetzliches", name: "Nützliches", color: "#d4edc0" },
  { legacyKey: "leicht_und_seicht", name: "Leicht und seicht", color: "#f5d9b8" },
  {
    legacyKey: "persoenliche_perspektive",
    name: "Persönl. Perspektive",
    color: "#ddd0f5",
  },
  { legacyKey: "groesseres_ganzes", name: "Grösseres Ganzes", color: "#c5dff5" },
  { legacyKey: "aha_perspektive", name: "Aha Perspektive", color: "#f0d9b8" },
];

export type ArticleCategoryRow = {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
  active: boolean;
};

export async function ensureDefaultArticleCategories(organizationId: string) {
  const count = await prisma.articleCategory.count({
    where: { organizationId },
  });
  if (count > 0) return;

  await prisma.articleCategory.createMany({
    data: DEFAULT_ARTICLE_CATEGORIES.map((c, i) => ({
      organizationId,
      name: c.name,
      color: c.color,
      sortOrder: i,
      active: true,
    })),
  });
}

export async function listArticleCategories(
  organizationId: string,
  opts?: { activeOnly?: boolean },
) {
  return prisma.articleCategory.findMany({
    where: {
      organizationId,
      ...(opts?.activeOnly ? { active: true } : {}),
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}
