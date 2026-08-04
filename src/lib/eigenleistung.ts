import { prisma } from "@/lib/db";

/** Default Eigenleistungs-Rubriken (Notion-Farben als Soft-Tints). */
export const DEFAULT_EIGENLEISTUNG_RUBRIKEN: {
  name: string;
  color: string;
}[] = [
  { name: "Sommerloch", color: "#e5e7eb" },
  { name: "Abstimmungen", color: "#e7e0d5" },
  { name: "Wohnbrief", color: "#ede9fe" },
  { name: "Züribriefing", color: "#dbeafe" },
  { name: "Tsüritipp", color: "#d1fae5" },
  { name: "Repo-Schicht", color: "#fce7f3" },
  { name: "GR-Briefing", color: "#ffedd5" },
  { name: "Kolumne", color: "#ffe4e6" },
];

export type EigenleistungRubrikRow = {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
  active: boolean;
};

export async function ensureDefaultEigenleistungRubriken(
  organizationId: string,
) {
  const count = await prisma.eigenleistungRubrik.count({
    where: { organizationId },
  });
  if (count > 0) return;

  await prisma.eigenleistungRubrik.createMany({
    data: DEFAULT_EIGENLEISTUNG_RUBRIKEN.map((r, i) => ({
      organizationId,
      name: r.name,
      color: r.color,
      sortOrder: i,
      active: true,
    })),
  });
}

export async function listEigenleistungRubriken(
  organizationId: string,
  opts?: { activeOnly?: boolean },
) {
  return prisma.eigenleistungRubrik.findMany({
    where: {
      organizationId,
      ...(opts?.activeOnly ? { active: true } : {}),
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}
