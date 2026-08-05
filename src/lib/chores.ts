import { prisma } from "@/lib/db";

export const DEFAULT_CHORES: { title: string; description: string }[] = [
  {
    title: "Müll-Held:innen",
    description:
      "Papier und Karton bündeln und an korrekten Daten rausstellen",
  },
  {
    title: "Recycling-Hero",
    description: "Glas, Pet und Alu entsorgen",
  },
  {
    title: "Küchen-Manager",
    description:
      "ab und zu den Kühlschrank putzen, schimmlige Lebensmittel entsorgen",
  },
  {
    title: "Fläschli-Geist",
    description:
      "Leere Harasse sortieren, neue Getränke in den Kühlschrank, Getränke nachbestellen",
  },
  {
    title: "Frottee-König:in",
    description:
      "Tüechli im Küche regelmässig ersetzen und waschen (zuhause)",
  },
  {
    title: "Vorrats-Performer:in",
    description: "Zürisacke-, Kaffee-, Milch-, Öl-Vorrat managen",
  },
  {
    title: "Marie-Kondo",
    description:
      "ab und zu Trash, der sich im ganzen Büro ansammelt, Besitzer:innen zurückbringen oder entsorgen",
  },
  {
    title: "Pflanzen-Flüsterin",
    description: "Pflanzen giessen",
  },
  {
    title: "Unko-Muetter",
    description:
      "Kleinere Essensmengen (z.B. 100g Pasta) in Unko-Box tun, man kann sich bedienen",
  },
  {
    title: "Kaffeemaschine",
    description: "Kafimaschine entkalken, reinigen, what else?",
  },
  {
    title: "Ämtli-König",
    description: "",
  },
];

export async function listChores(spaceId: string) {
  return prisma.task.findMany({
    where: {
      spaceId,
      kind: "chore",
      status: { not: "cancelled" },
    },
    include: {
      assignments: {
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
        orderBy: { user: { name: "asc" } },
      },
    },
    orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
  });
}

/** Ämtlis, die der User aktuell zugewiesen hat (Büro-Ämtliplan). */
export async function listAssignedChoresForUser(
  organizationId: string,
  userId: string,
) {
  return prisma.task.findMany({
    where: {
      kind: "chore",
      status: { not: "cancelled" },
      space: { organizationId, slug: "aemliplan" },
      assignments: { some: { userId } },
    },
    select: {
      id: true,
      title: true,
      description: true,
      spaceId: true,
    },
    orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
  });
}

export async function ensureDefaultChores(
  spaceId: string,
  createdById: string,
) {
  const existing = await prisma.task.count({
    where: { spaceId, kind: "chore" },
  });
  if (existing > 0) return;

  await prisma.task.createMany({
    data: DEFAULT_CHORES.map((chore, index) => ({
      spaceId,
      title: chore.title,
      description: chore.description || null,
      kind: "chore",
      status: "todo",
      createdById,
      sortOrder: index,
    })),
  });
}
