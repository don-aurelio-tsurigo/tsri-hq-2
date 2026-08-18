"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireMembership } from "@/lib/session";
import { canEditSpace, canViewSpace } from "@/lib/permissions";
import { membershipInTagPool } from "@/lib/membership-grants";
import {
  DEFAULT_ARTICLE_STAGE,
  isArticleStage,
} from "@/lib/editorial";

const articleCreateSchema = z.object({
  spaceId: z.string().min(1),
  title: z.string().min(1).max(200),
  description: z.string().max(50000).optional(),
  assigneeId: z.string().optional(),
  categoryId: z.string().optional(),
  stage: z.string().optional(),
  eigenleistungRubrikId: z.string().optional(),
  publishAt: z.string().optional(),
});

export async function createArticle(formData: FormData) {
  const { session, membership } = await requireMembership();
  const parsed = articleCreateSchema.safeParse({
    spaceId: formData.get("spaceId"),
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    assigneeId: formData.get("assigneeId") || undefined,
    categoryId: formData.has("categoryId")
      ? String(formData.get("categoryId") ?? "")
      : undefined,
    stage: formData.get("stage") || undefined,
    eigenleistungRubrikId: formData.has("eigenleistungRubrikId")
      ? String(formData.get("eigenleistungRubrikId") ?? "")
      : undefined,
    publishAt: formData.has("publishAt")
      ? String(formData.get("publishAt") ?? "")
      : undefined,
  });
  if (!parsed.success) {
    return { error: "Titel fehlt oder ist ungültig." };
  }

  const space = await prisma.space.findUnique({
    where: { id: parsed.data.spaceId },
    include: { access: true },
  });
  if (!space || !canEditSpace(session.user, space, membership)) {
    return { error: "Kein Zugriff auf diesen Space." };
  }

  let assigneeId: string | null = null;
  if (parsed.data.assigneeId && parsed.data.assigneeId.length > 0) {
    const inPool = await membershipInTagPool(
      membership.organizationId,
      parsed.data.assigneeId,
      "editorial",
    );
    if (!inPool) return { error: "Person ist nicht in der Redaktion." };
    assigneeId = parsed.data.assigneeId;
  } else if (
    await membershipInTagPool(
      membership.organizationId,
      session.user.id,
      "editorial",
    )
  ) {
    assigneeId = session.user.id;
  }

  let categoryId: string | null | undefined;
  if (parsed.data.categoryId !== undefined) {
    if (parsed.data.categoryId === "") {
      categoryId = null;
    } else {
      const cat = await prisma.articleCategory.findFirst({
        where: {
          id: parsed.data.categoryId,
          organizationId: membership.organizationId,
          active: true,
        },
      });
      if (!cat) return { error: "Ungültige Kategorie." };
      categoryId = cat.id;
    }
  }

  let eigenleistungRubrikId: string | null | undefined;
  if (parsed.data.eigenleistungRubrikId !== undefined) {
    if (parsed.data.eigenleistungRubrikId === "") {
      eigenleistungRubrikId = null;
    } else {
      const rubrik = await prisma.eigenleistungRubrik.findFirst({
        where: {
          id: parsed.data.eigenleistungRubrikId,
          organizationId: membership.organizationId,
          active: true,
        },
      });
      if (!rubrik) return { error: "Ungültige Eigenleistungs-Rubrik." };
      eigenleistungRubrikId = rubrik.id;
    }
  }

  const stage = isArticleStage(parsed.data.stage)
    ? parsed.data.stage
    : DEFAULT_ARTICLE_STAGE;

  let publishAt: Date | null | undefined;
  if (parsed.data.publishAt !== undefined) {
    const raw = parsed.data.publishAt.trim();
    if (raw !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      return { error: "Ungültiges Publikationsdatum." };
    }
    publishAt = raw ? new Date(`${raw}T12:00:00.000Z`) : null;
  }

  await prisma.article.create({
    data: {
      spaceId: space.id,
      title: parsed.data.title.trim(),
      description: parsed.data.description?.trim() || null,
      stage,
      assigneeId,
      createdById: session.user.id,
      ...(categoryId !== undefined ? { categoryId } : {}),
      ...(eigenleistungRubrikId !== undefined
        ? { eigenleistungRubrikId }
        : {}),
      ...(publishAt !== undefined ? { publishAt } : {}),
    },
  });

  revalidatePath("/home");
  revalidatePath(`/spaces/${space.id}`);
  revalidatePath(`/projects/${space.id}`);
  revalidatePath("/programm");

  return { ok: true as const };
}

const articleUpdateSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(50000).optional(),
  publishAt: z.string().optional(),
  stage: z.string().optional(),
  categoryId: z.string().optional(),
  eigenleistungRubrikId: z.string().optional(),
  assigneeId: z.string().optional(),
  clearCategory: z.string().optional(),
});

export async function updateArticle(formData: FormData) {
  const { session, membership } = await requireMembership();
  const parsed = articleUpdateSchema.safeParse({
    id: formData.get("id"),
    title: formData.get("title") || undefined,
    description:
      formData.get("description") === null
        ? undefined
        : formData.has("description")
          ? String(formData.get("description") ?? "")
          : undefined,
    publishAt: formData.has("publishAt")
      ? String(formData.get("publishAt") ?? "")
      : undefined,
    stage: formData.get("stage") || undefined,
    categoryId: formData.has("categoryId")
      ? String(formData.get("categoryId") ?? "")
      : undefined,
    eigenleistungRubrikId: formData.has("eigenleistungRubrikId")
      ? String(formData.get("eigenleistungRubrikId") ?? "")
      : undefined,
    assigneeId: formData.has("assigneeId")
      ? String(formData.get("assigneeId") ?? "")
      : undefined,
    clearCategory: formData.get("clearCategory") || undefined,
  });
  if (!parsed.success) {
    return { error: "Ungültige Artikel-Daten." };
  }

  const article = await prisma.article.findUnique({
    where: { id: parsed.data.id },
    include: { space: { include: { access: true } } },
  });
  if (!article || !canViewSpace(session.user, article.space, membership)) {
    return { error: "Artikel nicht gefunden." };
  }
  if (!canEditSpace(session.user, article.space, membership)) {
    return { error: "Keine Berechtigung." };
  }

  const stage = isArticleStage(parsed.data.stage) ? parsed.data.stage : undefined;

  const data: {
    title?: string;
    description?: string | null;
    publishAt?: Date | null;
    stage?: typeof stage;
    categoryId?: string | null;
    eigenleistungRubrikId?: string | null;
    assigneeId?: string | null;
  } = {};

  if (parsed.data.title) data.title = parsed.data.title.trim();
  if (parsed.data.description !== undefined) {
    data.description = parsed.data.description.trim() || null;
  }
  if (parsed.data.publishAt !== undefined) {
    const raw = parsed.data.publishAt.trim();
    if (raw !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      return { error: "Ungültiges Publikationsdatum." };
    }
    data.publishAt = raw ? new Date(`${raw}T12:00:00.000Z`) : null;
  }
  if (stage) data.stage = stage;

  if (parsed.data.clearCategory === "1") {
    data.categoryId = null;
  } else if (parsed.data.categoryId !== undefined) {
    if (parsed.data.categoryId === "") {
      data.categoryId = null;
    } else {
      const cat = await prisma.articleCategory.findFirst({
        where: {
          id: parsed.data.categoryId,
          organizationId: membership.organizationId,
        },
      });
      if (!cat) return { error: "Ungültige Kategorie." };
      data.categoryId = cat.id;
    }
  }
  if (parsed.data.eigenleistungRubrikId !== undefined) {
    if (parsed.data.eigenleistungRubrikId === "") {
      data.eigenleistungRubrikId = null;
    } else {
      const rubrik = await prisma.eigenleistungRubrik.findFirst({
        where: {
          id: parsed.data.eigenleistungRubrikId,
          organizationId: membership.organizationId,
        },
      });
      if (!rubrik) return { error: "Ungültige Eigenleistungs-Rubrik." };
      data.eigenleistungRubrikId = rubrik.id;
    }
  }

  if (parsed.data.assigneeId !== undefined) {
    const nextAssignee =
      parsed.data.assigneeId === "" ? null : parsed.data.assigneeId;
    if (nextAssignee) {
      const sameAsCurrent = nextAssignee === article.assigneeId;
      const inPool = await membershipInTagPool(
        membership.organizationId,
        nextAssignee,
        "editorial",
      );
      if (!sameAsCurrent && !inPool) {
        return { error: "Person ist nicht in der Redaktion." };
      }
    }
    data.assigneeId = nextAssignee;
  }

  await prisma.article.update({
    where: { id: article.id },
    data,
  });

  revalidatePath("/home");
  revalidatePath(`/spaces/${article.spaceId}`);
  revalidatePath("/programm");
  return { ok: true as const };
}

export async function moveArticleStage(formData: FormData) {
  const stage = String(formData.get("stage") ?? "");
  if (!isArticleStage(stage)) {
    return { error: "Ungültige Stage." };
  }
  formData.set("stage", stage);
  return updateArticle(formData);
}

export async function setArticlePublishAt(formData: FormData) {
  const { session, membership } = await requireMembership();
  const id = String(formData.get("id") ?? "");
  const raw = String(formData.get("publishAt") ?? "").trim();
  if (!id) return { error: "Fehlende ID." };
  if (raw !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return { error: "Ungültiges Datum." };
  }

  const article = await prisma.article.findUnique({
    where: { id },
    include: { space: { include: { access: true } } },
  });
  if (!article || !canEditSpace(session.user, article.space, membership)) {
    return { error: "Kein Zugriff." };
  }

  await prisma.article.update({
    where: { id },
    data: {
      publishAt: raw ? new Date(`${raw}T12:00:00.000Z`) : null,
    },
  });

  revalidatePath("/programm");
  revalidatePath(`/spaces/${article.spaceId}`);
  revalidatePath(`/projects/${article.spaceId}`);
  revalidatePath("/home");
  return { ok: true as const };
}

async function loadEditableArticle(id: string) {
  const { session, membership } = await requireMembership();
  const article = await prisma.article.findUnique({
    where: { id },
    include: { space: { include: { access: true } } },
  });
  if (!article || !canEditSpace(session.user, article.space, membership)) {
    return { error: "Kein Zugriff." as const };
  }
  return { article, session, membership };
}

export async function archiveArticle(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Fehlende ID." };
  const loaded = await loadEditableArticle(id);
  if ("error" in loaded) return loaded;

  await prisma.article.update({
    where: { id },
    data: { archivedAt: new Date() },
  });

  revalidatePath("/programm");
  revalidatePath(`/spaces/${loaded.article.spaceId}`);
  revalidatePath(`/projects/${loaded.article.spaceId}`);
  revalidatePath("/home");
  return { ok: true as const };
}

export async function unarchiveArticle(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Fehlende ID." };
  const loaded = await loadEditableArticle(id);
  if ("error" in loaded) return loaded;

  await prisma.article.update({
    where: { id },
    data: { archivedAt: null },
  });

  revalidatePath("/programm");
  revalidatePath(`/spaces/${loaded.article.spaceId}`);
  revalidatePath(`/projects/${loaded.article.spaceId}`);
  revalidatePath("/home");
  return { ok: true as const };
}

export async function deleteArticle(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Fehlende ID." };
  const loaded = await loadEditableArticle(id);
  if ("error" in loaded) return loaded;

  await prisma.article.delete({ where: { id } });

  revalidatePath("/programm");
  revalidatePath(`/spaces/${loaded.article.spaceId}`);
  revalidatePath(`/projects/${loaded.article.spaceId}`);
  revalidatePath("/home");
  return { ok: true as const };
}
