"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { format, isThisYear } from "date-fns";
import { de } from "date-fns/locale";
import { ArrowUp, ChevronRight, RotateCcw, Trash2 } from "lucide-react";
import type {
  ArticleCommentView,
  ArticleCommentsState,
  CommentThread,
} from "@/components/use-article-comments";

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
            // Inline color: the global `a` rule beats utilities (same as .wiki-prose a).
            style={{ color: "var(--accent-hover)" }}
            className="underline underline-offset-2"
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

export function Avatar({ name, filled }: { name: string; filled?: boolean }) {
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

/** Comments with avatar, name, date and a connecting line between them. */
export function CommentList({
  comments,
  onDelete,
}: {
  comments: ArticleCommentView[];
  onDelete: (comment: ArticleCommentView) => void;
}) {
  return (
    <ol>
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
                  onClick={() => onDelete(c)}
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
  );
}

/** Auto-growing input: Enter sends, Shift+Enter adds a line break. */
export function CommentInput({
  viewerName,
  placeholder = "Kommentar hinzufügen…",
  disabled,
  autoFocus,
  onSubmit,
  onCancel,
}: {
  viewerName: string;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  onSubmit: (body: string) => Promise<boolean>;
  onCancel?: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);

  useEffect(() => {
    if (autoFocus) ref.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  async function submit() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    const ok = await onSubmit(body);
    if (ok) setDraft("");
    setSending(false);
  }

  return (
    <div className="flex items-start gap-3">
      <Avatar name={viewerName} filled />
      <div className="flex min-w-0 flex-1 items-end gap-2 border-b border-[var(--border)] pb-1 focus-within:border-[var(--fg)]">
        <textarea
          ref={ref}
          rows={1}
          value={draft}
          maxLength={10000}
          disabled={disabled || sending}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void submit();
            } else if (e.key === "Escape" && onCancel) {
              e.stopPropagation();
              onCancel();
            }
          }}
          placeholder={placeholder}
          aria-label={placeholder.replace(/…$/, "")}
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
  );
}

export function QuoteLine({
  quote,
  clamp = true,
}: {
  quote: string;
  clamp?: boolean;
}) {
  return (
    <p
      className={[
        "border-l-[3px] border-[#e8c800] pl-2 text-xs text-[var(--muted)]",
        clamp ? "line-clamp-2" : "",
      ].join(" ")}
    >
      {quote}
    </p>
  );
}

/** Page-level comments plus an overview of the threads on text passages. */
export function ArticleComments({
  state,
  onOpenThread,
}: {
  state: ArticleCommentsState;
  onOpenThread: (threadId: string) => void;
}) {
  const [showResolved, setShowResolved] = useState(false);
  const { pageComments, threads, viewer, loaded, error } = state;
  const open = threads.filter((t) => !t.root.resolvedAt);
  const resolved = threads.filter((t) => t.root.resolvedAt);

  function confirmDelete(c: ArticleCommentView) {
    if (confirm("Kommentar löschen?")) void state.remove(c.id);
  }

  return (
    <section className="mt-6" aria-label="Kommentare">
      <h3 className="mb-2 text-sm font-semibold text-[var(--muted)]">
        Kommentare
        {pageComments.length > 0 ? ` · ${pageComments.length}` : ""}
      </h3>

      {pageComments.length > 0 && (
        <div className="mb-1">
          <CommentList comments={pageComments} onDelete={confirmDelete} />
        </div>
      )}

      {error && <p className="mb-2 text-sm text-[var(--danger)]">{error}</p>}

      <CommentInput
        viewerName={viewer?.name ?? ""}
        disabled={!loaded}
        onSubmit={async (body) => (await state.add({ body })) !== null}
      />

      {threads.length > 0 && (
        <div className="mt-5">
          <h3 className="mb-1.5 text-sm font-semibold text-[var(--muted)]">
            Zu Textstellen{open.length > 0 ? ` · ${open.length}` : ""}
          </h3>
          {open.length > 0 && (
            <ul className="flex flex-col gap-1">
              {open.map((t) => (
                <ThreadRow key={t.root.id} thread={t} onOpen={onOpenThread} />
              ))}
            </ul>
          )}
          {resolved.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setShowResolved((s) => !s)}
                className="mt-1.5 inline-flex items-center gap-1 text-xs text-[var(--muted)] hover:text-[var(--fg)]"
              >
                <ChevronRight
                  className={`size-3.5 transition-transform ${showResolved ? "rotate-90" : ""}`}
                />
                {resolved.length} erledigt
              </button>
              {showResolved && (
                <ul className="mt-1 flex flex-col gap-1 opacity-75">
                  {resolved.map((t) => (
                    <ThreadRow
                      key={t.root.id}
                      thread={t}
                      onReopen={() => void state.setResolved(t.root.id, false)}
                    />
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}

function ThreadRow({
  thread,
  onOpen,
  onReopen,
}: {
  thread: CommentThread;
  onOpen?: (threadId: string) => void;
  onReopen?: () => void;
}) {
  const { root, replies } = thread;
  const content = (
    <>
      <QuoteLine quote={root.quote ?? ""} />
      <p className="mt-1 line-clamp-1 text-sm">
        <span className="font-semibold">{root.author.name}:</span> {root.body}
      </p>
      {replies.length > 0 && (
        <p className="text-xs text-[var(--muted)]">
          {replies.length} {replies.length === 1 ? "Antwort" : "Antworten"}
        </p>
      )}
    </>
  );
  return (
    <li className="flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-black/[0.03]">
      {onOpen ? (
        <button
          type="button"
          onClick={() => onOpen(root.id)}
          className="min-w-0 flex-1 text-left"
        >
          {content}
        </button>
      ) : (
        <div className="min-w-0 flex-1">{content}</div>
      )}
      {onReopen && (
        <button
          type="button"
          onClick={onReopen}
          className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-xs text-[var(--muted)] hover:bg-black/5 hover:text-[var(--fg)]"
        >
          <RotateCcw className="size-3" /> Wieder öffnen
        </button>
      )}
    </li>
  );
}
