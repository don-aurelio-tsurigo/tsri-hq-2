"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireMembership } from "@/lib/session";
import { canEditSpace, canViewSpace } from "@/lib/permissions";
import type { CommentListResult } from "@/lib/comment-types";

const commentSchema = z.object({
  taskId: z.string().min(1),
  body: z.string().trim().min(1).max(10000),
});

async function loadViewableTask(taskId: string) {
  const { session, membership } = await requireMembership();
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { space: { include: { access: true } } },
  });
  if (!task || !canViewSpace(session.user, task.space, membership)) {
    return null;
  }
  return { session, membership, task };
}

const NOT_FOUND = { error: "Task nicht gefunden." };

function revalidateTask(spaceId: string) {
  revalidatePath("/home");
  revalidatePath("/tasks");
  revalidatePath(`/spaces/${spaceId}`);
  revalidatePath(`/projects/${spaceId}`);
}

export async function listTaskComments(
  taskId: string,
): Promise<CommentListResult> {
  const loaded = await loadViewableTask(taskId);
  if (!loaded) return NOT_FOUND;
  const { session, membership, task } = loaded;
  const moderator = canEditSpace(session.user, task.space, membership);

  const comments = await prisma.taskComment.findMany({
    where: { taskId },
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
      parentId: null,
      quote: null,
      resolvedAt: null,
      canDelete: moderator || c.authorId === session.user.id,
    })),
  };
}

/** Everyone who can see the task may comment. */
export async function addTaskComment(formData: FormData) {
  const parsed = commentSchema.safeParse({
    taskId: formData.get("taskId"),
    body: formData.get("body"),
  });
  if (!parsed.success) return { error: "Kommentar ist leer oder zu lang." };

  const loaded = await loadViewableTask(parsed.data.taskId);
  if (!loaded) return NOT_FOUND;

  const created = await prisma.taskComment.create({
    data: {
      taskId: parsed.data.taskId,
      authorId: loaded.session.user.id,
      body: parsed.data.body,
    },
  });

  revalidateTask(loaded.task.spaceId);
  return { ok: true as const, id: created.id };
}

/** Authors delete their own comments; editors of the space may delete any. */
export async function deleteTaskComment(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Fehlende ID." };

  const comment = await prisma.taskComment.findUnique({ where: { id } });
  if (!comment) return { error: "Kommentar nicht gefunden." };

  const loaded = await loadViewableTask(comment.taskId);
  if (!loaded) return NOT_FOUND;
  const { session, membership, task } = loaded;
  const allowed =
    comment.authorId === session.user.id ||
    canEditSpace(session.user, task.space, membership);
  if (!allowed) return { error: "Keine Berechtigung." };

  await prisma.taskComment.delete({ where: { id } });

  revalidateTask(task.spaceId);
  return { ok: true as const };
}
