"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { hashPassword } from "better-auth/crypto";
import { prisma } from "@/lib/db";
import { requireAdmin, requireSession } from "@/lib/session";
import { ensurePersonalSpace } from "@/lib/spaces";

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "member"]).default("member"),
});

export async function createInvitation(formData: FormData) {
  const { session, membership } = await requireAdmin();
  const parsed = inviteSchema.safeParse({
    email: formData.get("email"),
    role: formData.get("role") || "member",
  });
  if (!parsed.success) {
    return { error: "Ungültige E-Mail oder Rolle." };
  }

  const email = parsed.data.email.toLowerCase().trim();
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    const alreadyMember = await prisma.membership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: membership.organizationId,
          userId: existingUser.id,
        },
      },
    });
    if (alreadyMember && !alreadyMember.archivedAt) {
      return { error: "Diese Person ist bereits im Team." };
    }
  }

  const openInvite = await prisma.invitation.findFirst({
    where: {
      organizationId: membership.organizationId,
      email,
      acceptedAt: null,
      expiresAt: { gt: new Date() },
    },
  });
  if (openInvite) {
    return {
      error: "Es gibt bereits eine offene Einladung für diese E-Mail.",
      token: openInvite.token,
    };
  }

  const invitation = await prisma.invitation.create({
    data: {
      email,
      organizationId: membership.organizationId,
      role: parsed.data.role,
      invitedById: session.user.id,
      expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    },
  });

  revalidatePath("/settings/members");
  return { ok: true as const, token: invitation.token };
}

const acceptSchema = z.object({
  token: z.string().min(1),
  name: z.string().min(2).max(80),
  password: z.string().min(8).max(128),
});

export async function acceptInvitation(formData: FormData) {
  const parsed = acceptSchema.safeParse({
    token: formData.get("token"),
    name: formData.get("name"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: "Bitte Name (min. 2) und Passwort (min. 8) angeben." };
  }

  const invitation = await prisma.invitation.findUnique({
    where: { token: parsed.data.token },
    include: { organization: true },
  });

  if (!invitation || invitation.acceptedAt) {
    return { error: "Einladung ungültig oder bereits benutzt." };
  }
  if (invitation.expiresAt < new Date()) {
    return { error: "Diese Einladung ist abgelaufen." };
  }

  const email = invitation.email.toLowerCase();
  let user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    const hashed = await hashPassword(parsed.data.password);
    user = await prisma.user.create({
      data: {
        name: parsed.data.name.trim(),
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
  } else {
    // Existing user: ensure password credential exists / updates
    const hashed = await hashPassword(parsed.data.password);
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
    await prisma.user.update({
      where: { id: user.id },
      data: { name: parsed.data.name.trim() },
    });
  }

  await prisma.membership.upsert({
    where: {
      organizationId_userId: {
        organizationId: invitation.organizationId,
        userId: user.id,
      },
    },
    create: {
      organizationId: invitation.organizationId,
      userId: user.id,
      role: invitation.role,
    },
    update: { role: invitation.role, archivedAt: null },
  });

  await ensurePersonalSpace(
    invitation.organizationId,
    user.id,
    parsed.data.name.trim(),
  );

  await prisma.invitation.update({
    where: { id: invitation.id },
    data: { acceptedAt: new Date() },
  });

  redirect(`/login?email=${encodeURIComponent(email)}&joined=1`);
}

export async function revokeInvitation(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Fehlende ID." };

  await prisma.invitation.delete({ where: { id } }).catch(() => null);
  revalidatePath("/settings/members");
  return { ok: true as const };
}

export async function createBootstrapOrganization(formData: FormData): Promise<void> {
  const session = await requireSession();
  const existing = await prisma.membership.findFirst({
    where: { userId: session.user.id },
  });
  if (existing) {
    redirect("/home");
  }

  // Only allow bootstrap if no orgs exist yet
  const orgCount = await prisma.organization.count();
  if (orgCount > 0) {
    redirect("/onboarding");
  }

  const name = String(formData.get("name") ?? "").trim() || "Tsüri-Team";
  const slug =
    String(formData.get("slug") ?? "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-") || "team";

  const org = await prisma.organization.create({
    data: {
      name,
      slug,
      memberships: {
        create: {
          userId: session.user.id,
          role: "admin",
        },
      },
    },
  });

  const { ensureDefaultTeamSpaces } = await import("@/lib/spaces");
  await ensureDefaultTeamSpaces(org.id);
  await ensurePersonalSpace(org.id, session.user.id, session.user.name);

  const { ensureWikiStarterPages } = await import("@/lib/wiki");
  await ensureWikiStarterPages(org.id, session.user.id);

  redirect("/home");
}
