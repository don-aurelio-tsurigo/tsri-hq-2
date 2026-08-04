import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaSchemaVersion: number | undefined;
};

/**
 * Bump when schema changes that stale hot-reload clients would miss
 * (especially new enum values — Prisma 7 runtimeDataModel.enums is empty).
 */
const PRISMA_CLIENT_SCHEMA_VERSION = 12; // v12: Membership.archivedAt

/** Fields/relations that must exist after schema pushes — invalidates stale hot-reload clients. */
const REQUIRED_FIELDS: Record<string, string[]> = {
  User: ["phone", "birthDate", "privateNotes"],
  Task: [
    "category",
    "assignments",
    "publishAt",
    "groupId",
    "eigenleistungRubrikId",
    "archivedAt",
  ],
  Space: ["archivedAt", "isTemplate"],
  NewsletterType: ["weekdays"],
  Membership: ["pensumPercent", "archivedAt"],
};

const REQUIRED_MODELS = [
  "TaskAssignment",
  "TaskGroup",
  "CookingSlot",
  "NewsletterType",
  "NewsletterCampaign",
  "VacationRequest",
  "TimeEntry",
  "EigenleistungRubrik",
  "WikiPage",
] as const;

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

function clientMatchesSchema(client: PrismaClient) {
  try {
    const anyPrisma = client as unknown as {
      _runtimeDataModel?: {
        models?: Record<string, { fields?: { name: string }[] }>;
      };
    };
    const models = anyPrisma._runtimeDataModel?.models;
    if (!models) return false;

    for (const modelName of REQUIRED_MODELS) {
      if (!models[modelName]) return false;
    }

    for (const [modelName, required] of Object.entries(REQUIRED_FIELDS)) {
      const fields = models[modelName]?.fields?.map((f) => f.name) ?? [];
      if (fields.length === 0) return false;
      if (!required.every((name) => fields.includes(name))) return false;
    }

    return true;
  } catch {
    return false;
  }
}

function getPrismaClient() {
  const existing = globalForPrisma.prisma;
  const versionOk =
    globalForPrisma.prismaSchemaVersion === PRISMA_CLIENT_SCHEMA_VERSION;

  if (existing && versionOk && clientMatchesSchema(existing)) {
    return existing;
  }

  const client = createPrismaClient();
  globalForPrisma.prisma = client;
  globalForPrisma.prismaSchemaVersion = PRISMA_CLIENT_SCHEMA_VERSION;
  return client;
}

export const prisma = getPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaSchemaVersion = PRISMA_CLIENT_SCHEMA_VERSION;
}
