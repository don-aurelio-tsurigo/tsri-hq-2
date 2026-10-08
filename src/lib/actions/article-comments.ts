"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireMembership } from "@/lib/session";
import {
  canEditSpace,
  canManageEditorial,
  canViewSpace,
} from "@/lib/permissions";

export type ArticleCommentView = {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; name: string };
  /** Set on replies: the thread start this answers. */
  parentId: string | null;
  /** Set on thread starts anchored to a text passage. */
  quote: string | null;
  resolvedAt: string | null;
  canDelete: boolean;
};

const commentSchema = z.object({
  articleId: z.string().min(1),
  body: z.string().trim().min(1).max(10000),
  parentId: z.string().min(1).optional(),
  quote: z.string().trim().min(1).max(2000).optional(),
});

async function loadViewableArticle(articleId: string) {
  const { session, membership } = await requireMembership();
  const article = await prisma.article.findUnique({
    where: { id: articleId },
    include: { space: { include: { access: true } } },
  });
  if (!article || !canViewSpace(session.user, article.space, membership)) {
    return null;
  }
  return { session, membership, article };
}

const NOT_FOUND = { error: "Artikel nicht gefunden." };

export async function listArticleComments(
  articleId: string,
): Promise<
  | { error: string }
  | { comments: ArticleCommentView[]; viewer: { id: string; name: string } }
> {
  const loaded = await loadViewableArticle(articleId);
  if (!loaded) return NOT_FOUND;
  const { session, membership, article } = loaded;
  const moderator =
    canManageEditorial(membership) ||
    canEditSpace(session.user, article.space, membership);

  const comments = await prisma.articleComment.findMany({
    where: { articleId },
    include: { author: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });

  return {
    viewer: { id: session.user.id, name: session.user.name },
    comments: comments.map((c) => ({
      id: c.id,
      body: c.body,
      createdAt: c.createdAt.toISOString(),
      author: c.author,
      parentId: c.parentId,
      quote: c.quote,
      resolvedAt: c.resolvedAt ? c.resolvedAt.toISOString() : null,
      canDelete: moderator || c.authorId === session.user.id,
    })),
  };
}

/**
 * Everyone who can see the article may comment. A `quote` starts a thread on
 * a text passage (the client then marks the passage with the returned id);
 * a `parentId` adds a reply to an existing thread.
 */
export async function addArticleComment(formData: FormData) {
  const parsed = commentSchema.safeParse({
    articleId: formData.get("articleId"),
    body: formData.get("body"),
    parentId: formData.get("parentId") || undefined,
    quote: formData.get("quote") || undefined,
  });
  if (!parsed.success) return { error: "Kommentar ist leer oder zu lang." };

  const loaded = await loadViewableArticle(parsed.data.articleId);
  if (!loaded) return NOT_FOUND;

  let parentId: string | null = null;
  if (parsed.data.parentId) {
    const parent = await prisma.articleComment.findUnique({
      where: { id: parsed.data.parentId },
      select: { articleId: true, parentId: true },
    });
    if (!parent || parent.articleId !== parsed.data.articleId) {
      return { error: "Thread nicht gefunden." };
    }
    // Keep threads flat: replies to a reply attach to the thread start.
    parentId = parent.parentId ?? parsed.data.parentId;
  }

  const created = await prisma.articleComment.create({
    data: {
      articleId: parsed.data.articleId,
      authorId: loaded.session.user.id,
      body: parsed.data.body,
      parentId,
      quote: parentId ? null : (parsed.data.quote ?? null),
    },
  });

  revalidatePath(`/spaces/${loaded.article.spaceId}`);
  return { ok: true as const, id: created.id };
}

/** Mark a thread done (or reopen it). Anyone who can comment may do this. */
export async function setArticleCommentResolved(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const resolved = formData.get("resolved") === "1";
  if (!id) return { error: "Fehlende ID." };

  const comment = await prisma.articleComment.findUnique({ where: { id } });
  if (!comment || comment.parentId) return { error: "Thread nicht gefunden." };

  const loaded = await loadViewableArticle(comment.articleId);
  if (!loaded) return NOT_FOUND;

  await prisma.articleComment.update({
    where: { id },
    data: { resolvedAt: resolved ? new Date() : null },
  });

  revalidatePath(`/spaces/${loaded.article.spaceId}`);
  return { ok: true as const };
}

/**
 * Authors delete their own comments; editors of the space may delete any.
 * Deleting a thread start removes its replies too.
 */
export async function deleteArticleComment(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Fehlende ID." };

  const comment = await prisma.articleComment.findUnique({ where: { id } });
  if (!comment) return { error: "Kommentar nicht gefunden." };

  const loaded = await loadViewableArticle(comment.articleId);
  if (!loaded) return NOT_FOUND;
  const { session, membership, article } = loaded;
  const allowed =
    comment.authorId === session.user.id ||
    canManageEditorial(membership) ||
    canEditSpace(session.user, article.space, membership);
  if (!allowed) return { error: "Keine Berechtigung." };

  await prisma.articleComment.delete({ where: { id } });

  revalidatePath(`/spaces/${article.spaceId}`);
  return { ok: true as const };
}
