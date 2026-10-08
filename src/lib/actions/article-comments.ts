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
  canDelete: boolean;
};

const commentSchema = z.object({
  articleId: z.string().min(1),
  body: z.string().trim().min(1).max(10000),
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
      canDelete: moderator || c.authorId === session.user.id,
    })),
  };
}

/** Everyone who can see the article may comment. */
export async function addArticleComment(formData: FormData) {
  const parsed = commentSchema.safeParse({
    articleId: formData.get("articleId"),
    body: formData.get("body"),
  });
  if (!parsed.success) return { error: "Kommentar ist leer oder zu lang." };

  const loaded = await loadViewableArticle(parsed.data.articleId);
  if (!loaded) return NOT_FOUND;

  await prisma.articleComment.create({
    data: {
      articleId: parsed.data.articleId,
      authorId: loaded.session.user.id,
      body: parsed.data.body,
    },
  });

  revalidatePath(`/spaces/${loaded.article.spaceId}`);
  return { ok: true as const };
}

/** Authors delete their own comments; editors of the space may delete any. */
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
