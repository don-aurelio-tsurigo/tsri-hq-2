"use client";

import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { Editor } from "@tiptap/react";
import { Check, X } from "lucide-react";
import {
  CommentInput,
  CommentList,
  QuoteLine,
} from "@/components/article-comments";
import type { CommentSelection } from "@/components/article-rich-editor";
import type { CommentView } from "@/lib/comment-types";
import type { CommentsState } from "@/components/use-comments";

export type ActiveComment =
  | { kind: "new"; selection: CommentSelection }
  | { kind: "thread"; id: string };

const POPOVER_WIDTH = 340;

/**
 * Floating box under a text passage: write the first comment of a new thread,
 * or read and answer an existing one. Positioned inside `containerRef`
 * (which must be `position: relative`) so it scrolls with the text.
 */
export function ArticleCommentPopover({
  active,
  editor,
  containerRef,
  state,
  onCreateThread,
  onDeleteThread,
  onClose,
}: {
  active: ActiveComment;
  editor: Editor;
  containerRef: RefObject<HTMLElement | null>;
  state: CommentsState;
  onCreateThread: (selection: CommentSelection, body: string) => Promise<boolean>;
  onDeleteThread: (threadId: string) => void;
  onClose: () => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{
    top: number;
    left: number;
    width: number;
    anchorMissing: boolean;
  }>();

  const thread =
    active.kind === "thread"
      ? state.threads.find((t) => t.root.id === active.id)
      : undefined;
  const threadId = active.kind === "thread" ? active.id : null;
  const selectionTo = active.kind === "new" ? active.selection.to : null;

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    function place() {
      if (!container) return;
      const box = container.getBoundingClientRect();
      let anchorBottom: number | null = null;
      let anchorLeft = box.left;
      if (selectionTo !== null) {
        const coords = editor.view.coordsAtPos(selectionTo);
        anchorBottom = coords.bottom;
        anchorLeft = coords.left;
      } else if (threadId) {
        const spans = container.querySelectorAll(
          `[data-comment="${CSS.escape(threadId)}"]`,
        );
        const last = spans[spans.length - 1];
        if (last) {
          const rects = last.getClientRects();
          const rect = rects[rects.length - 1] ?? last.getBoundingClientRect();
          anchorBottom = rect.bottom;
          anchorLeft = rect.left;
        }
      }
      const width = Math.min(POPOVER_WIDTH, box.width);
      const top =
        anchorBottom === null ? 0 : anchorBottom - box.top + 6;
      const left = Math.max(
        0,
        Math.min(anchorLeft - box.left - 24, box.width - width),
      );
      setPos({
        top,
        left,
        width,
        anchorMissing: threadId !== null && anchorBottom === null,
      });
    }
    place();
    const observer = new ResizeObserver(place);
    observer.observe(container);
    return () => observer.disconnect();
  }, [containerRef, editor, selectionTo, threadId]);

  // Close when clicking elsewhere (clicks on other passages reopen via the editor).
  useLayoutEffect(() => {
    function onDown(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (boxRef.current?.contains(target)) return;
      if (target.closest?.("[data-comment]")) return;
      onClose();
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [onClose]);

  useLayoutEffect(() => {
    boxRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [pos?.top]);

  if (active.kind === "thread" && !thread) return null;

  function confirmDelete(c: CommentView) {
    if (!confirm(c.parentId ? "Antwort löschen?" : "Ganzen Thread löschen?")) {
      return;
    }
    if (c.parentId) void state.remove(c.id);
    else onDeleteThread(c.id);
  }

  const quote =
    active.kind === "new" ? active.selection.quote : (thread?.root.quote ?? "");

  return (
    <div
      ref={boxRef}
      role="dialog"
      aria-label={active.kind === "new" ? "Neuer Kommentar" : "Kommentar-Thread"}
      className="absolute z-30 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-elevated)] p-3 shadow-[0_12px_40px_rgba(0,0,0,0.18)]"
      style={{
        top: pos?.top ?? 0,
        left: pos?.left ?? 0,
        width: pos?.width ?? POPOVER_WIDTH,
        visibility: pos ? "visible" : "hidden",
      }}
    >
      <div className="mb-2 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <QuoteLine quote={quote} />
          {pos?.anchorMissing && (
            <p className="mt-1 text-xs text-[var(--muted)]">
              Die Textstelle wurde inzwischen gelöscht.
            </p>
          )}
        </div>
        {thread && (
          <button
            type="button"
            title={thread.root.resolvedAt ? "Wieder öffnen" : "Als erledigt markieren"}
            aria-label={thread.root.resolvedAt ? "Wieder öffnen" : "Als erledigt markieren"}
            onClick={async () => {
              await state.setResolved(thread.root.id, !thread.root.resolvedAt);
              if (!thread.root.resolvedAt) onClose();
            }}
            className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-[var(--muted)] hover:bg-black/5 hover:text-[var(--fg)]"
          >
            <Check className="size-3.5" />
            {thread.root.resolvedAt ? "Öffnen" : "Erledigt"}
          </button>
        )}
        <button
          type="button"
          aria-label="Schliessen"
          onClick={onClose}
          className="shrink-0 rounded-md p-1 text-[var(--muted)] hover:bg-black/5 hover:text-[var(--fg)]"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {thread && (
        <div className="max-h-[45vh] overflow-y-auto">
          <CommentList
            comments={[thread.root, ...thread.replies]}
            onDelete={confirmDelete}
          />
        </div>
      )}

      {state.error && (
        <p className="mb-2 text-sm text-[var(--danger)]">{state.error}</p>
      )}

      <CommentInput
        key={active.kind === "new" ? "new" : active.id}
        viewerName={state.viewer?.name ?? ""}
        placeholder={active.kind === "new" ? "Kommentar hinzufügen…" : "Antworten…"}
        // Focus once placed: a `visibility: hidden` field can't take focus.
        autoFocus={!!pos}
        onCancel={onClose}
        onSubmit={async (body) => {
          if (active.kind === "new") {
            return onCreateThread(active.selection, body);
          }
          return (await state.add({ body, parentId: active.id })) !== null;
        }}
      />
    </div>
  );
}
