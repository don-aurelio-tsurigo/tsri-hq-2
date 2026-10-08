"use client";

import { useEffect, useState } from "react";
import {
  addArticleComment,
  deleteArticleComment,
  listArticleComments,
  setArticleCommentResolved,
} from "@/lib/actions";
import type { ArticleCommentView } from "@/lib/actions/article-comments";

export type { ArticleCommentView };

export type CommentThread = {
  root: ArticleCommentView;
  replies: ArticleCommentView[];
};

/** Comments of one article, shared by the page comments and inline threads. */
export function useArticleComments(articleId: string) {
  const [comments, setComments] = useState<ArticleCommentView[] | null>(null);
  const [viewer, setViewer] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  function apply(result: Awaited<ReturnType<typeof listArticleComments>>) {
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setComments(result.comments);
    setViewer(result.viewer);
  }

  useEffect(() => {
    let cancelled = false;
    void listArticleComments(articleId).then((result) => {
      if (!cancelled) apply(result);
    });
    return () => {
      cancelled = true;
    };
  }, [articleId]);

  async function refresh() {
    apply(await listArticleComments(articleId));
  }

  /** Returns the new comment's id, or null on failure. */
  async function add(input: {
    body: string;
    parentId?: string;
    quote?: string;
  }): Promise<string | null> {
    setError(null);
    const fd = new FormData();
    fd.set("articleId", articleId);
    fd.set("body", input.body);
    if (input.parentId) fd.set("parentId", input.parentId);
    if (input.quote) fd.set("quote", input.quote);
    const result = await addArticleComment(fd);
    if (!result.id) {
      setError(result.error ?? "Kommentar konnte nicht gespeichert werden.");
      return null;
    }
    await refresh();
    return result.id;
  }

  async function remove(id: string): Promise<boolean> {
    const fd = new FormData();
    fd.set("id", id);
    const result = await deleteArticleComment(fd);
    if ("error" in result) {
      setError(result.error);
      return false;
    }
    setComments(
      (list) => list?.filter((c) => c.id !== id && c.parentId !== id) ?? null,
    );
    return true;
  }

  async function setResolved(id: string, resolved: boolean) {
    const fd = new FormData();
    fd.set("id", id);
    fd.set("resolved", resolved ? "1" : "");
    const result = await setArticleCommentResolved(fd);
    if ("error" in result) {
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

export type ArticleCommentsState = ReturnType<typeof useArticleComments>;
