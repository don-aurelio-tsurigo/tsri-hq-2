import { prisma } from "@/lib/db";
import type { WikiPageDetail, WikiPageNode } from "@/lib/wiki-shared";

export type { WikiPageDetail, WikiPageNode } from "@/lib/wiki-shared";
export { buildWikiTree } from "@/lib/wiki-shared";

type StarterPage = {
  title: string;
  slug: string;
  body: string;
  children?: Omit<StarterPage, "children">[];
};

const STARTER_TEMPLATE = (title: string, blurb: string) =>
  `# ${title}\n\n${blurb}\n\n## Inhalt\n\n- Punkt 1\n- Punkt 2\n\n_Diese Seite ist eine Vorlage — bitte ergänzen._\n`;

const WIKI_STARTER: StarterPage[] = [
  {
    title: "Onboarding",
    slug: "onboarding",
    body: STARTER_TEMPLATE(
      "Onboarding",
      "Alles, was neue Teammitglieder in den ersten Tagen brauchen.",
    ),
    children: [
      {
        title: "Erster Tag",
        slug: "erster-tag",
        body: STARTER_TEMPLATE(
          "Erster Tag",
          "Checkliste für den ersten Arbeitstag (Zugang, Tour, Ansprechpersonen).",
        ),
      },
      {
        title: "Zugänge & Tools",
        slug: "zugaenge-tools",
        body: STARTER_TEMPLATE(
          "Zugänge & Tools",
          "Accounts, Passwörter, Tools und wo man Hilfe bekommt.",
        ),
      },
      {
        title: "Wer ist wer",
        slug: "wer-ist-wer",
        body: STARTER_TEMPLATE(
          "Wer ist wer",
          "Rollen und Ansprechpersonen im Team.",
        ),
      },
    ],
  },
  {
    title: "Prozesse",
    slug: "prozesse",
    body: STARTER_TEMPLATE(
      "Prozesse",
      "How-tos und Abläufe für den Arbeitsalltag.",
    ),
    children: [
      {
        title: "Redaktion",
        slug: "prozess-redaktion",
        body: STARTER_TEMPLATE(
          "Redaktion",
          "Artikel-Workflow von Input bis Publikation.",
        ),
      },
      {
        title: "Technik",
        slug: "prozess-technik",
        body: STARTER_TEMPLATE(
          "Technik",
          "Technische Abläufe, Deployments, Wartung.",
        ),
      },
      {
        title: "Büro",
        slug: "prozess-buero",
        body: STARTER_TEMPLATE(
          "Büro",
          "Büro-Abläufe, Lieferungen, Gäste, Material.",
        ),
      },
    ],
  },
  {
    title: "Regeln & Richtlinien",
    slug: "regeln-richtlinien",
    body: STARTER_TEMPLATE(
      "Regeln & Richtlinien",
      "Vereinbarungen, die für alle gelten.",
    ),
    children: [
      {
        title: "Arbeitszeit & Ferien",
        slug: "arbeitszeit-ferien",
        body: STARTER_TEMPLATE(
          "Arbeitszeit & Ferien",
          "Pensum, Erfassung, Krankmeldung und Ferienprozess.",
        ),
      },
      {
        title: "Kommunikation",
        slug: "kommunikation",
        body: STARTER_TEMPLATE(
          "Kommunikation",
          "Kanäle, Erreichbarkeit, Ton nach aussen.",
        ),
      },
      {
        title: "Sicherheit",
        slug: "sicherheit",
        body: STARTER_TEMPLATE(
          "Sicherheit",
          "Zugänge, Daten, Geräte und sensible Informationen.",
        ),
      },
    ],
  },
];

export function slugifyTitle(title: string): string {
  const base = title
    .trim()
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "seite";
}

export async function uniqueWikiSlug(
  organizationId: string,
  title: string,
  excludeId?: string,
): Promise<string> {
  const base = slugifyTitle(title);
  let candidate = base;
  let n = 2;
  for (;;) {
    const existing = await prisma.wikiPage.findUnique({
      where: {
        organizationId_slug: { organizationId, slug: candidate },
      },
      select: { id: true },
    });
    if (!existing || existing.id === excludeId) return candidate;
    candidate = `${base}-${n}`;
    n += 1;
  }
}

export async function getWikiSpace(organizationId: string) {
  return prisma.space.findUnique({
    where: {
      organizationId_slug: { organizationId, slug: "wiki" },
    },
  });
}

export async function ensureWikiStarterPages(
  organizationId: string,
  createdById: string,
) {
  const space = await getWikiSpace(organizationId);
  if (!space) return null;

  const count = await prisma.wikiPage.count({
    where: { organizationId, spaceId: space.id },
  });
  if (count > 0) return space;

  let rootOrder = 0;
  for (const root of WIKI_STARTER) {
    const parent = await prisma.wikiPage.create({
      data: {
        organizationId,
        spaceId: space.id,
        title: root.title,
        slug: root.slug,
        body: root.body,
        parentId: null,
        sortOrder: rootOrder++,
        pinned: root.slug === "onboarding",
        createdById,
        updatedById: createdById,
      },
    });

    let childOrder = 0;
    for (const child of root.children ?? []) {
      await prisma.wikiPage.create({
        data: {
          organizationId,
          spaceId: space.id,
          title: child.title,
          slug: child.slug,
          body: child.body,
          parentId: parent.id,
          sortOrder: childOrder++,
          pinned: false,
          createdById,
          updatedById: createdById,
        },
      });
    }
  }

  return space;
}

export async function listWikiPages(organizationId: string, spaceId: string) {
  return prisma.wikiPage.findMany({
    where: { organizationId, spaceId },
    select: {
      id: true,
      title: true,
      slug: true,
      parentId: true,
      sortOrder: true,
      pinned: true,
    },
    orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
  });
}

export async function listPinnedWikiPages(
  organizationId: string,
  limit = 8,
) {
  return prisma.wikiPage.findMany({
    where: { organizationId, pinned: true },
    select: {
      id: true,
      title: true,
      slug: true,
      spaceId: true,
    },
    orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
    take: limit,
  });
}

export async function getWikiPageBySlug(
  organizationId: string,
  slug: string,
): Promise<WikiPageDetail | null> {
  return prisma.wikiPage.findUnique({
    where: {
      organizationId_slug: { organizationId, slug },
    },
    select: {
      id: true,
      title: true,
      slug: true,
      parentId: true,
      sortOrder: true,
      pinned: true,
      body: true,
      updatedAt: true,
      createdBy: { select: { id: true, name: true } },
      updatedBy: { select: { id: true, name: true } },
    },
  });
}
