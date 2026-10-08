"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { format, isThisYear } from "date-fns";
import { de } from "date-fns/locale";
import { ArrowUp, Trash2 } from "lucide-react";
import {
  addArticleComment,
  deleteArticleComment,
  listArticleComments,
} from "@/lib/actions";
import type { ArticleCommentView } from "@/lib/actions/article-comments";

const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g;

/** Plain text with clickable links and preserved line breaks. */
function CommentBody({ text }: { text: string }) {
  const parts = text.split(URL_RE);
  return (
    <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-[var(--muted)] underline-offset-2 hover:decoration-[var(--fg)]"
          >
            {part}
          </a>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </p>
  );
}

function Avatar({ name, filled }: { name: string; filled?: boolean }) {
  return (
    <span
      className={[
        "inline-flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
        filled
          ? "bg-[var(--fg)] text-white"
          : "border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--muted)]",
      ].join(" ")}
      aria-hidden
    >
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

function formatCommentDate(iso: string) {
  const date = new Date(iso);
  return format(date, isThisYear(date) ? "d. MMM" : "d. MMM yyyy", {
    locale: de,
  });
}

export function ArticleComments({ articleId }: { articleId: string }) {
  const [comments, setComments] = useState<ArticleCommentView[] | null>(null);
  const [viewer, setViewer] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);

  async function submit() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    const fd = new FormData();
    fd.set("articleId", articleId);
    fd.set("body", body);
    const result = await addArticleComment(fd);
    if (result.error) {
      setError(result.error);
    } else {
      setDraft("");
      apply(await listArticleComments(articleId));
    }
    setSending(false);
  }

  async function remove(id: string) {
    if (!confirm("Kommentar löschen?")) return;
    const fd = new FormData();
    fd.set("id", id);
    const result = await deleteArticleComment(fd);
    if ("error" in result) setError(result.error);
    else setComments((list) => list?.filter((c) => c.id !== id) ?? null);
  }

  return (
    <section className="mt-6" aria-label="Kommentare">
      <h3 className="mb-2 text-sm font-semibold text-[var(--muted)]">
        Kommentare
        {comments && comments.length > 0 ? ` · ${comments.length}` : ""}
      </h3>

      {comments && comments.length > 0 && (
        <ol className="mb-1">
          {comments.map((c, i) => (
            <li key={c.id} className="group relative flex gap-3 pb-3">
              {i < comments.length - 1 && (
                <span
                  className="absolute top-8 bottom-0 left-[13px] w-px bg-[var(--border)]"
                  aria-hidden
                />
              )}
              <Avatar name={c.author.name} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="truncate text-sm font-semibold">
                    {c.author.name}
                  </span>
                  <time
                    dateTime={c.createdAt}
                    title={format(new Date(c.createdAt), "d. MMMM yyyy, HH:mm", {
                      locale: de,
                    })}
                    className="shrink-0 text-xs text-[var(--muted)]"
                  >
                    {formatCommentDate(c.createdAt)}
                  </time>
                  {c.canDelete && (
                    <button
                      type="button"
                      aria-label="Kommentar löschen"
                      title="Löschen"
                      onClick={() => void remove(c.id)}
                      className="ml-auto rounded p-1 text-[var(--muted)] opacity-100 transition-opacity hover:bg-black/5 hover:text-[var(--danger)] sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </div>
                <CommentBody text={c.body} />
              </div>
            </li>
          ))}
        </ol>
      )}

      {error && <p className="mb-2 text-sm text-[var(--danger)]">{error}</p>}

      <div className="flex items-start gap-3">
        <Avatar name={viewer?.name ?? ""} filled />
        <div className="flex min-w-0 flex-1 items-end gap-2 border-b border-[var(--border)] pb-1 focus-within:border-[var(--fg)]">
          <textarea
            ref={inputRef}
            rows={1}
            value={draft}
            maxLength={10000}
            disabled={comments === null}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void submit();
              }
            }}
            placeholder="Kommentar hinzufügen…"
            aria-label="Kommentar hinzufügen"
            // Inline font: the global `textarea { font: inherit }` beats utilities.
            style={{ font: "400 0.875rem/1.6 var(--font-body), system-ui, sans-serif" }}
            className="block min-h-7 w-full resize-none overflow-hidden border-0 bg-transparent py-1 outline-none placeholder:text-[var(--muted)]"
          />
          {draft.trim() && (
            <button
              type="button"
              aria-label="Kommentar senden (Enter)"
              title="Senden (Enter) · Neue Zeile: Shift+Enter"
              disabled={sending}
              onClick={() => void submit()}
              className="mb-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--fg)] text-white disabled:opacity-50"
            >
              <ArrowUp className="size-4" />
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
