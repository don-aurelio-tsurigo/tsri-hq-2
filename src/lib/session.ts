import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function getSession() {
  return auth.api.getSession({
    headers: await headers(),
  });
}

export async function requireSession() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  return session;
}

export async function getMembership(userId: string) {
  return prisma.membership.findFirst({
    where: { userId },
    include: {
      organization: true,
      user: true,
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function requireMembership() {
  const session = await requireSession();
  const membership = await getMembership(session.user.id);
  if (!membership) {
    redirect("/onboarding");
  }
  return { session, membership };
}

export async function requireAdmin() {
  const ctx = await requireMembership();
  if (ctx.membership.role !== "admin") {
    redirect("/home");
  }
  return ctx;
}
