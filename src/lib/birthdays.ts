import { prisma } from "@/lib/db";
import { greetingName } from "@/lib/user-name";

const TZ = "Europe/Zurich";

function zurichMonthDay(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  return `${month}-${day}`;
}

/** Month-day of a `@db.Date` value (UTC calendar day). */
function birthMonthDay(date: Date) {
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${month}-${day}`;
}

export type BirthdayPerson = { id: string; name: string };

export async function listTodaysBirthdays(
  organizationId: string,
): Promise<BirthdayPerson[]> {
  const members = await prisma.membership.findMany({
    where: {
      organizationId,
      archivedAt: null,
      user: { birthDate: { not: null } },
    },
    select: {
      user: {
        select: {
          id: true,
          name: true,
          firstName: true,
          birthDate: true,
        },
      },
    },
    orderBy: { user: { name: "asc" } },
  });

  const today = zurichMonthDay();
  return members
    .filter(
      (m) => m.user.birthDate && birthMonthDay(m.user.birthDate) === today,
    )
    .map((m) => ({
      id: m.user.id,
      name: greetingName(m.user),
    }));
}

export function formatBirthdayAnnouncement(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return `Heute hat ${names[0]} Geburtstag.`;
  const last = names[names.length - 1];
  const head = names.slice(0, -1).join(", ");
  return `Heute haben ${head} und ${last} Geburtstag.`;
}
