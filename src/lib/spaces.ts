import { prisma } from "@/lib/db";
import type { SpaceType } from "@/generated/prisma/client";

const DEFAULT_TEAM_SPACES: {
  name: string;
  slug: string;
  type: SpaceType;
  description: string;
}[] = [
  {
    name: "Redaktion",
    slug: "redaktion",
    type: "team",
    description: "Artikel-Kanban: Input bis Publiziert",
  },
  {
    name: "Kochplan",
    slug: "kochplan",
    type: "team",
    description: "Wöchentlicher Kochplan",
  },
  {
    name: "Ämtliplan",
    slug: "aemliplan",
    type: "team",
    description: "Büro-Ämtli / Chores",
  },
  {
    name: "Team Infos",
    slug: "team-infos",
    type: "team",
    description: "Kontaktdaten und Geburtstage",
  },
  {
    name: "Ferienplan",
    slug: "ferienplan",
    type: "team",
    description: "Ferien eintragen und von Admins freigeben lassen",
  },
  {
    name: "Wiki",
    slug: "wiki",
    type: "team",
    description: "Wissensbasis des Teams",
  },
  {
    name: "Newsfeed",
    slug: "quellen",
    type: "team",
    description: "Lokaler Newsfeed: RSS und Quellen reviewen",
  },
];

export async function ensurePersonalSpace(
  organizationId: string,
  userId: string,
  userName: string,
) {
  const existing = await prisma.space.findFirst({
    where: {
      organizationId,
      type: "personal",
      ownerUserId: userId,
    },
  });
  if (existing) return existing;

  const slug = `personal-${userId.slice(0, 8)}`;
  return prisma.space.create({
    data: {
      organizationId,
      type: "personal",
      name: `${userName.split(" ")[0]}'s Space`,
      slug,
      description: "Privater Bereich — nur für dich sichtbar",
      visibility: "private",
      ownerUserId: userId,
    },
  });
}

/** Migrate legacy slugs (buero → team-infos) then ensure defaults. */
export async function ensureDefaultTeamSpaces(organizationId: string) {
  const legacyBuero = await prisma.space.findUnique({
    where: {
      organizationId_slug: { organizationId, slug: "buero" },
    },
  });
  const teamInfos = await prisma.space.findUnique({
    where: {
      organizationId_slug: { organizationId, slug: "team-infos" },
    },
  });
  if (legacyBuero && !teamInfos) {
    await prisma.space.update({
      where: { id: legacyBuero.id },
      data: {
        slug: "team-infos",
        name: "Team Infos",
        description: "Kontaktdaten und Geburtstage",
      },
    });
  }

  const created = [];
  for (const space of DEFAULT_TEAM_SPACES) {
    const existing = await prisma.space.findUnique({
      where: {
        organizationId_slug: {
          organizationId,
          slug: space.slug,
        },
      },
    });
    if (existing) {
      if (
        existing.name !== space.name ||
        existing.description !== space.description
      ) {
        const updated = await prisma.space.update({
          where: { id: existing.id },
          data: {
            name: space.name,
            description: space.description,
          },
        });
        created.push(updated);
      } else {
        created.push(existing);
      }
      continue;
    }
    const row = await prisma.space.create({
      data: {
        organizationId,
        type: space.type,
        name: space.name,
        slug: space.slug,
        description: space.description,
        visibility: "team",
      },
    });
    created.push(row);
  }
  return created;
}

export async function listVisibleSpaces(
  organizationId: string,
  userId: string,
) {
  const spaces = await prisma.space.findMany({
    where: { organizationId },
    include: { access: true },
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });

  return spaces.filter((space) => {
    if (space.type === "personal") {
      return space.ownerUserId === userId;
    }
    if (space.visibility === "private") {
      return space.ownerUserId === userId;
    }
    if (space.visibility === "restricted") {
      return (
        space.ownerUserId === userId ||
        space.access.some((a) => a.userId === userId)
      );
    }
    return true;
  });
}

export async function getPersonalSpace(organizationId: string, userId: string) {
  return prisma.space.findFirst({
    where: {
      organizationId,
      type: "personal",
      ownerUserId: userId,
    },
  });
}

export function spaceBySlug(
  spaces: { id: string; name: string; slug: string }[],
  slug: string,
) {
  return spaces.find((s) => s.slug === slug) ?? null;
}
