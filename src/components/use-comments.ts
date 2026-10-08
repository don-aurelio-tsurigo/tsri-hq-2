"use client";

import { useEffect, useState } from "react";
import {
  addArticleComment,
  addTaskComment,
  deleteArticleComment,
  deleteTaskComment,
  listArticleComments,
  listTaskComments,
  setArticleCommentResolved,
} from "@/lib/actions";
import type { CommentListResult, CommentView } from "@/lib/comment-types";

export type CommentThread = {
  root: CommentView;
  replies: CommentView[];
};

type ActionResult = { error?: string; id?: string } | { ok: true; id?: string };

/** Server actions behind one kind of comments (article, task). */
type CommentsApi = {
  /** Form field that carries the id of the commented item. */
  idField: string;
  list: (id: string) => Promise<CommentListResult>;
  add: (fd: FormData) => Promise<ActionResult>;
  remove: (fd: FormData) => Promise<ActionResult>;
  setResolved?: (fd: FormData) => Promise<ActionResult>;
};

const ARTICLE_COMMENTS: CommentsApi = {
  idField: "articleId",
  list: listArticleComments,
  add: addArticleComment,
  remove: deleteArticleComment,
  setResolved: setArticleCommentResolved,
};

const TASK_COMMENTS: CommentsApi = {
  idField: "taskId",
  list: listTaskComments,
  add: addTaskComment,
  remove: deleteTaskComment,
};

export function useArticleComments(articleId: string) {
  return useComments(articleId, ARTICLE_COMMENTS);
}

export function useTaskComments(taskId: string) {
  return useComments(taskId, TASK_COMMENTS);
}

/** Comments of one item, shared by the comment list and inline threads. */
function useComments(entityId: string, api: CommentsApi) {
  const [comments, setComments] = useState<CommentView[] | null>(null);
  const [viewer, setViewer] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  function apply(result: CommentListResult) {
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setComments(result.comments);
    setViewer(result.viewer);
  }

  useEffect(() => {
    let cancelled = false;
    void api.list(entityId).then((result) => {
      if (!cancelled) apply(result);
    });
    return () => {
      cancelled = true;
    };
  }, [entityId, api]);

  async function refresh() {
    apply(await api.list(entityId));
  }

  /** Returns the new comment's id, or null on failure. */
  async function add(input: {
    body: string;
    parentId?: string;
    quote?: string;
  }): Promise<string | null> {
    setError(null);
    const fd = new FormData();
    fd.set(api.idField, entityId);
    fd.set("body", input.body);
    if (input.parentId) fd.set("parentId", input.parentId);
    if (input.quote) fd.set("quote", input.quote);
    const result = await api.add(fd);
    if (!result.id) {
      setError(
        ("error" in result && result.error) ||
          "Kommentar konnte nicht gespeichert werden.",
      );
      return null;
    }
    await refresh();
    return result.id;
  }

  async function remove(id: string): Promise<boolean> {
    const fd = new FormData();
    fd.set("id", id);
    const result = await api.remove(fd);
    if ("error" in result && result.error) {
      setError(result.error);
      return false;
    }
    setComments(
      (list) => list?.filter((c) => c.id !== id && c.parentId !== id) ?? null,
    );
    return true;
  }

  async function setResolved(id: string, resolved: boolean) {
    if (!api.setResolved) return;
    const fd = new FormData();
    fd.set("id", id);
    fd.set("resolved", resolved ? "1" : "");
    const result = await api.setResolved(fd);
    if ("error" in result && result.error) {
      setError(result.error);
      return;
    }
    await refresh();
  }

  const pageComments = (comments ?? []).filter(
    (c) => !c.parentId && !c.quote,
  );
  const threads: CommentThread[] = (comments ?? [])
    .filter((c) => !c.parentId && c.quote)
    .map((root) => ({
      root,
      replies: (comments ?? []).filter((c) => c.parentId === root.id),
    }));

  return {
    loaded: comments !== null,
    viewer,
    error,
    setError,
    pageComments,
    threads,
    add,
    remove,
    setResolved,
  };
}

export type CommentsState = ReturnType<typeof useComments>;
