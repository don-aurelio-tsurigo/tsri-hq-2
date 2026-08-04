import { prisma } from "@/lib/db";
import { VACATION_STATUS_LABELS } from "@/lib/vacation-constants";

export { VACATION_STATUS_LABELS };
export { toVacationDateKey as toDateKey } from "@/lib/vacation-constants";

export async function listVisibleVacationRequests(
  organizationId: string,
  userId: string,
  isAdmin: boolean,
) {
  return prisma.vacationRequest.findMany({
    where: isAdmin
      ? { organizationId }
      : {
          organizationId,
          OR: [{ status: "approved" }, { userId }],
        },
    include: {
      user: { select: { id: true, name: true } },
      reviewedBy: { select: { id: true, name: true } },
    },
    orderBy: [{ startDate: "asc" }, { createdAt: "desc" }],
  });
}

/** Upcoming own vacations that are still running or start in the future. */
export async function listUpcomingOwnVacations(
  organizationId: string,
  userId: string,
  limit = 3,
) {
  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);
  const todayNoon = new Date(`${todayKey}T12:00:00.000Z`);

  return prisma.vacationRequest.findMany({
    where: {
      organizationId,
      userId,
      status: { in: ["approved", "pending"] },
      endDate: { gte: todayNoon },
    },
    orderBy: [{ startDate: "asc" }],
    take: limit,
    select: {
      id: true,
      startDate: true,
      endDate: true,
      note: true,
      status: true,
    },
  });
}

export async function getFerienplanSpaceId(organizationId: string) {
  const space = await prisma.space.findFirst({
    where: { organizationId, slug: "ferienplan" },
    select: { id: true },
  });
  return space?.id ?? null;
}

/** Pending vacation requests awaiting admin approval. */
export async function listPendingVacationApprovals(organizationId: string) {
  return prisma.vacationRequest.findMany({
    where: { organizationId, status: "pending" },
    include: {
      user: { select: { id: true, name: true } },
    },
    orderBy: [{ startDate: "asc" }, { createdAt: "asc" }],
  });
}
