import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const getSession = cache(async () => {
  return auth.api.getSession({
    headers: await headers(),
  });
});

export async function requireSession() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  return session;
}

/** Active (non-archived) membership for the user. */
export const getMembership = cache(async (userId: string) => {
  return prisma.membership.findFirst({
    where: { userId, archivedAt: null },
    include: {
      organization: true,
      user: true,
    },
    orderBy: { createdAt: "asc" },
  });
});

export const getArchivedMembership = cache(async (userId: string) => {
  return prisma.membership.findFirst({
    where: { userId, archivedAt: { not: null } },
    include: {
      organization: true,
      user: true,
    },
    orderBy: { createdAt: "asc" },
  });
});

export const requireMembership = cache(async () => {
  const session = await requireSession();
  const membership = await getMembership(session.user.id);
  if (!membership) {
    const archived = await getArchivedMembership(session.user.id);
    if (archived) {
      redirect("/access-revoked");
    }
    redirect("/onboarding");
  }
  return { session, membership };
});

/** Session + active membership, or null (for JSON APIs — no redirect). */
export async function getActiveMembershipContext() {
  const session = await getSession();
  if (!session) return null;
  const membership = await getMembership(session.user.id);
  if (!membership) return null;
  return { session, membership };
}

export async function requireAdmin() {
  const ctx = await requireMembership();
  if (ctx.membership.role !== "admin") {
    redirect("/home");
  }
  return ctx;
}
