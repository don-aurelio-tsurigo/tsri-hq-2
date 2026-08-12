import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "better-auth/crypto";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  const email = (process.env.SEED_ADMIN_EMAIL ?? "admin@team.local").toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? "admin1234";
  const name = process.env.SEED_ADMIN_NAME ?? "Admin";
  const orgName = process.env.SEED_ORG_NAME ?? "Tsüri-Team";
  const orgSlug = process.env.SEED_ORG_SLUG ?? "team";

  const hashed = await hashPassword(password);
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        name,
        email,
        emailVerified: true,
        accounts: {
          create: {
            accountId: email,
            providerId: "credential",
            password: hashed,
          },
        },
      },
    });
    console.log(`Created admin user ${email}`);
  } else {
    await prisma.user.update({
      where: { id: user.id },
      data: { name, emailVerified: true },
    });
    const account = await prisma.account.findFirst({
      where: { userId: user.id, providerId: "credential" },
    });
    if (account) {
      await prisma.account.update({
        where: { id: account.id },
        data: { password: hashed },
      });
    } else {
      await prisma.account.create({
        data: {
          userId: user.id,
          accountId: email,
          providerId: "credential",
          password: hashed,
        },
      });
    }
    console.log(`Updated admin user ${email} (password synced from SEED_*)`);
  }

  let org = await prisma.organization.findUnique({ where: { slug: orgSlug } });
  if (!org) {
    org = await prisma.organization.create({
      data: { name: orgName, slug: orgSlug },
    });
    console.log(`Created organization ${orgName}`);
  }

  await prisma.membership.upsert({
    where: {
      organizationId_userId: {
        organizationId: org.id,
        userId: user.id,
      },
    },
    create: {
      organizationId: org.id,
      userId: user.id,
      role: "admin",
    },
    update: { role: "admin" },
  });

  const teamSpaces = [
    {
      name: "Redaktion",
      slug: "redaktion",
      description: "Artikel-Kanban: Input bis Publiziert",
    },
    {
      name: "Kochplan",
      slug: "kochplan",
      description: "Wöchentlicher Kochplan",
    },
    {
      name: "Ämtliplan",
      slug: "aemliplan",
      description: "Büro-Ämtli / Chores",
    },
    {
      name: "Team Infos",
      slug: "team-infos",
      description: "Kontaktdaten und Geburtstage",
    },
    {
      name: "Ferienplan",
      slug: "ferienplan",
      description: "Ferien eintragen und von Admins freigeben lassen",
    },
    {
      name: "Wiki",
      slug: "wiki",
      description: "Wissensbasis des Teams",
    },
    {
      name: "Newsfeed",
      slug: "quellen",
      description: "Lokaler Newsfeed: RSS und Quellen reviewen",
    },
  ];

  for (const space of teamSpaces) {
    await prisma.space.upsert({
      where: {
        organizationId_slug: {
          organizationId: org.id,
          slug: space.slug,
        },
      },
      create: {
        organizationId: org.id,
        type: "team",
        name: space.name,
        slug: space.slug,
        description: space.description,
        visibility: "team",
      },
      update: {
        name: space.name,
        description: space.description,
      },
    });
  }

  // Wiki-Starterseiten werden beim ersten Besuch via ensureWikiStarterPages angelegt.

  const personalSlug = `personal-${user.id.slice(0, 8)}`;
  const personal = await prisma.space.findFirst({
    where: {
      organizationId: org.id,
      type: "personal",
      ownerUserId: user.id,
    },
  });
  if (!personal) {
    await prisma.space.create({
      data: {
        organizationId: org.id,
        type: "personal",
        name: `${name.split(" ")[0]} Privat`,
        slug: personalSlug,
        description: "Privater Bereich — nur für dich sichtbar",
        visibility: "private",
        ownerUserId: user.id,
      },
    });
    console.log("Created personal space for admin");
  }

  console.log("\nSeed complete.");
  console.log(`  Login: ${email}`);
  console.log(`  Password: ${password}`);
  console.log(`  Org: ${orgName} (${orgSlug})`);

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
