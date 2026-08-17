"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { hashPassword } from "better-auth/crypto";
import { prisma } from "@/lib/db";
import {
  getArchivedMembership,
  getMembership,
  requireAdmin,
  requireMembership,
  requireSession,
} from "@/lib/session";
import { ensurePersonalSpace } from "@/lib/spaces";
import { joinDisplayName } from "@/lib/user-name";

const notesSchema = z.object({
  notes: z.string().max(50000),
});

export async function updatePrivateNotes(formData: FormData) {
  const { session } = await requireMembership();
  const parsed = notesSchema.safeParse({
    notes: String(formData.get("notes") ?? ""),
  });
  if (!parsed.success) {
    return { error: "Notiz ungültig." };
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { privateNotes: parsed.data.notes },
  });

  revalidatePath("/home");
  return { ok: true as const };
}

const namePart = z.string().trim().min(1).max(80);

async function applyUserName(
  userId: string,
  firstName: string,
  lastName: string,
) {
  const name = joinDisplayName(firstName, lastName);
  await prisma.user.update({
    where: { id: userId },
    data: { firstName, lastName, name },
  });

  const memberships = await prisma.membership.findMany({
    where: { userId },
    select: { organizationId: true },
  });
  for (const membership of memberships) {
    await ensurePersonalSpace(membership.organizationId, userId, firstName);
  }

  return name;
}

const completeNameSchema = z.object({
  firstName: namePart,
  lastName: namePart,
});

export async function completeOwnName(formData: FormData) {
  const session = await requireSession();
  const parsed = completeNameSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
  });
  if (!parsed.success) {
    return { error: "Bitte Vorname und Nachname angeben." };
  }

  await applyUserName(
    session.user.id,
    parsed.data.firstName,
    parsed.data.lastName,
  );

  const membership = await getMembership(session.user.id);
  if (membership) {
    redirect("/home");
  }
  const archived = await getArchivedMembership(session.user.id);
  if (archived) {
    redirect("/access-revoked");
  }
  redirect("/onboarding");
}

const adminNameSchema = z.object({
  userId: z.string().min(1),
  firstName: namePart,
  lastName: namePart,
});

export async function adminUpdateMemberName(formData: FormData) {
  const { membership } = await requireAdmin();
  const parsed = adminNameSchema.safeParse({
    userId: formData.get("userId"),
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
  });
  if (!parsed.success) {
    return { error: "Bitte Vorname und Nachname angeben." };
  }

  const target = await prisma.membership.findUnique({
    where: {
      organizationId_userId: {
        organizationId: membership.organizationId,
        userId: parsed.data.userId,
      },
    },
  });
  if (!target) {
    return { error: "Person ist nicht im Team." };
  }

  await applyUserName(
    parsed.data.userId,
    parsed.data.firstName,
    parsed.data.lastName,
  );

  revalidatePath("/settings/members");
  revalidatePath("/home");
  const teamInfos = await prisma.space.findFirst({
    where: { organizationId: membership.organizationId, slug: "team-infos" },
    select: { id: true },
  });
  if (teamInfos) revalidatePath(`/spaces/${teamInfos.id}`);
  return { ok: true as const };
}

const profileSchema = z.object({
  userId: z.string().min(1),
  phone: z.string().max(40).optional(),
  birthDate: z.string().optional(),
});

export async function updateMemberProfile(formData: FormData) {
  const { session, membership } = await requireMembership();
  const parsed = profileSchema.safeParse({
    userId: formData.get("userId"),
    phone: formData.has("phone") ? String(formData.get("phone") ?? "") : undefined,
    birthDate: formData.has("birthDate")
      ? String(formData.get("birthDate") ?? "")
      : undefined,
  });
  if (!parsed.success) {
    return { error: "Ungültige Profildaten." };
  }

  const isSelf = parsed.data.userId === session.user.id;
  const isAdmin = membership.role === "admin";
  if (!isSelf && !isAdmin) {
    return { error: "Keine Berechtigung." };
  }

  const targetMembership = await prisma.membership.findUnique({
    where: {
      organizationId_userId: {
        organizationId: membership.organizationId,
        userId: parsed.data.userId,
      },
    },
  });
  if (!targetMembership) {
    return { error: "Person ist nicht im Team." };
  }

  const phone =
    parsed.data.phone !== undefined
      ? parsed.data.phone.trim() || null
      : undefined;
  const birthDate =
    parsed.data.birthDate !== undefined
      ? parsed.data.birthDate
        ? new Date(parsed.data.birthDate)
        : null
      : undefined;

  await prisma.user.update({
    where: { id: parsed.data.userId },
    data: {
      ...(phone !== undefined ? { phone } : {}),
      ...(birthDate !== undefined ? { birthDate } : {}),
    },
  });

  const teamInfos = await prisma.space.findFirst({
    where: {
      organizationId: membership.organizationId,
      slug: "team-infos",
    },
    select: { id: true },
  });
  if (teamInfos) {
    revalidatePath(`/spaces/${teamInfos.id}`);
  }
  return { ok: true as const };
}

const pensumSchema = z.object({
  userId: z.string().min(1),
  pensumPercent: z.coerce
    .number()
    .int()
    .min(5)
    .max(100)
    .refine((n) => n % 5 === 0, "Pensum in 5%-Schritten"),
});

export async function updateMemberPensum(formData: FormData) {
  const { membership } = await requireAdmin();
  const parsed = pensumSchema.safeParse({
    userId: formData.get("userId"),
    pensumPercent: formData.get("pensumPercent"),
  });
  if (!parsed.success) {
    return { error: "Pensum muss zwischen 5 und 100 % in 5%-Schritten liegen." };
  }

  const target = await prisma.membership.findUnique({
    where: {
      organizationId_userId: {
        organizationId: membership.organizationId,
        userId: parsed.data.userId,
      },
    },
  });
  if (!target) return { error: "Person ist nicht im Team." };
  if (target.archivedAt) {
    return { error: "Archivierte Mitglieder können kein Pensum ändern." };
  }

  await prisma.membership.update({
    where: { id: target.id },
    data: { pensumPercent: parsed.data.pensumPercent },
  });

  revalidatePath("/settings/members");
  revalidatePath("/hours");
  revalidatePath("/home");
  const teamInfos = await prisma.space.findFirst({
    where: { organizationId: membership.organizationId, slug: "team-infos" },
    select: { id: true },
  });
  if (teamInfos) revalidatePath(`/spaces/${teamInfos.id}`);
  return { ok: true as const };
}

export async function archiveMember(formData: FormData) {
  const { session, membership } = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  if (!userId) return { error: "Fehlende Person." };

  if (userId === session.user.id) {
    return { error: "Du kannst dich nicht selbst archivieren." };
  }

  const target = await prisma.membership.findUnique({
    where: {
      organizationId_userId: {
        organizationId: membership.organizationId,
        userId,
      },
    },
  });
  if (!target || target.archivedAt) {
    return { error: "Aktives Mitglied nicht gefunden." };
  }

  if (target.role === "admin") {
    const otherAdmins = await prisma.membership.count({
      where: {
        organizationId: membership.organizationId,
        role: "admin",
        archivedAt: null,
        userId: { not: userId },
      },
    });
    if (otherAdmins === 0) {
      return { error: "Der letzte Admin kann nicht archiviert werden." };
    }
  }

  await prisma.membership.update({
    where: { id: target.id },
    data: { archivedAt: new Date() },
  });

  revalidatePath("/settings/members");
  revalidatePath("/settings/hours");
  revalidatePath("/home");
  return { ok: true as const };
}

export async function restoreMember(formData: FormData) {
  const { membership } = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  if (!userId) return { error: "Fehlende Person." };

  const target = await prisma.membership.findUnique({
    where: {
      organizationId_userId: {
        organizationId: membership.organizationId,
        userId,
      },
    },
  });
  if (!target || !target.archivedAt) {
    return { error: "Archiviertes Mitglied nicht gefunden." };
  }

  await prisma.membership.update({
    where: { id: target.id },
    data: { archivedAt: null },
  });

  revalidatePath("/settings/members");
  revalidatePath("/settings/hours");
  revalidatePath("/home");
  return { ok: true as const };
}

async function setCredentialPassword(userId: string, email: string, password: string) {
  const hashed = await hashPassword(password);
  const account = await prisma.account.findFirst({
    where: { userId, providerId: "credential" },
  });
  if (account) {
    await prisma.account.update({
      where: { id: account.id },
      data: { password: hashed },
    });
  } else {
    await prisma.account.create({
      data: {
        userId,
        accountId: email,
        providerId: "credential",
        password: hashed,
      },
    });
  }
  // Force re-login with the new password
  await prisma.session.deleteMany({ where: { userId } });
}

const adminSetPasswordSchema = z.object({
  userId: z.string().min(1),
  password: z.string().min(8).max(128),
});

export async function adminSetMemberPassword(formData: FormData) {
  const { membership } = await requireAdmin();
  const parsed = adminSetPasswordSchema.safeParse({
    userId: formData.get("userId"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: "Passwort mindestens 8 Zeichen." };
  }

  const target = await prisma.membership.findUnique({
    where: {
      organizationId_userId: {
        organizationId: membership.organizationId,
        userId: parsed.data.userId,
      },
    },
    include: { user: { select: { id: true, email: true } } },
  });
  if (!target || target.archivedAt) {
    return { error: "Aktives Mitglied nicht gefunden." };
  }

  await setCredentialPassword(
    target.user.id,
    target.user.email,
    parsed.data.password,
  );

  // Invalidate unused reset links for this user
  await prisma.passwordResetToken.updateMany({
    where: { userId: target.user.id, usedAt: null },
    data: { usedAt: new Date() },
  });

  revalidatePath("/settings/members");
  return { ok: true as const };
}

export async function adminCreatePasswordResetLink(formData: FormData) {
  const { session, membership } = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  if (!userId) return { error: "Fehlende Person." };

  const target = await prisma.membership.findUnique({
    where: {
      organizationId_userId: {
        organizationId: membership.organizationId,
        userId,
      },
    },
    include: { user: { select: { id: true, name: true } } },
  });
  if (!target || target.archivedAt) {
    return { error: "Aktives Mitglied nicht gefunden." };
  }

  // One open link at a time
  await prisma.passwordResetToken.updateMany({
    where: { userId: target.user.id, usedAt: null },
    data: { usedAt: new Date() },
  });

  const { randomBytes } = await import("crypto");
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 48); // 48h

  await prisma.passwordResetToken.create({
    data: {
      userId: target.user.id,
      token,
      expiresAt,
      createdById: session.user.id,
    },
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return {
    ok: true as const,
    url: `${appUrl}/reset-password/${token}`,
    expiresAt: expiresAt.toISOString(),
  };
}

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(128),
});

export async function resetPasswordWithToken(formData: FormData) {
  const parsed = resetPasswordSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: "Passwort mindestens 8 Zeichen." };
  }

  const reset = await prisma.passwordResetToken.findUnique({
    where: { token: parsed.data.token },
    include: { user: { select: { id: true, email: true } } },
  });
  if (!reset || reset.usedAt) {
    return { error: "Link ungültig oder bereits benutzt." };
  }
  if (reset.expiresAt < new Date()) {
    return { error: "Dieser Link ist abgelaufen." };
  }

  await setCredentialPassword(
    reset.user.id,
    reset.user.email,
    parsed.data.password,
  );

  await prisma.passwordResetToken.update({
    where: { id: reset.id },
    data: { usedAt: new Date() },
  });

  return { ok: true as const };
}
