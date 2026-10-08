"use client";

import { useCallback, useRef, useState } from "react";
import { Archive, ArchiveRestore, Trash2 } from "lucide-react";
import type { Editor } from "@tiptap/react";
import {
  archiveArticle,
  deleteArticle,
  unarchiveArticle,
  updateArticle,
} from "@/lib/actions";
import {
  ARTICLE_STAGES,
  ARTICLE_STAGE_COLORS,
  ARTICLE_STAGE_LABELS,
  DEFAULT_ARTICLE_STAGE,
  isArticleStage,
} from "@/lib/editorial";
import {
  addCommentMark,
  ArticleRichEditor,
  countWords,
  removeCommentMark,
} from "@/components/article-rich-editor";
import { CommentsSection } from "@/components/article-comments";
import {
  ArticleCommentPopover,
  type ActiveComment,
} from "@/components/article-comment-popover";
import { useArticleComments } from "@/components/use-comments";
import {
  createdMeta,
  EditorDialogShell,
  EditorError,
  MenuItem,
  PillDate,
  PillSelect,
  TitleInput,
  useAutosave,
  type PillOption,
} from "@/components/editor-dialog";

export type EditorArticle = {
  id: string;
  title: string;
  description: string | null;
  stage: string | null;
  categoryId: string | null;
  eigenleistungRubrikId?: string | null;
  publishAt?: string | null;
  archivedAt?: string | null;
  assigneeId: string | null;
  createdAt: string | Date;
  createdBy: { id: string; name: string };
};

export function ArticleEditorDialog({
  article,
  members,
  categories,
  rubriken,
  canEdit,
  onClose,
}: {
  article: EditorArticle | null;
  members: PillOption[];
  categories: PillOption[];
  /** Omit to hide the Eigenleistungs-Rubrik property. */
  rubriken?: PillOption[];
  canEdit: boolean;
  onClose: () => void;
}) {
  if (!article) return null;
  return (
    <EditorPanel
      key={article.id}
      article={article}
      members={members}
      categories={categories}
      rubriken={rubriken}
      canEdit={canEdit}
      onClose={onClose}
    />
  );
}

function EditorPanel({
  article,
  members,
  categories,
  rubriken,
  canEdit,
  onClose,
}: {
  article: EditorArticle;
  members: PillOption[];
  categories: PillOption[];
  rubriken?: PillOption[];
  canEdit: boolean;
  onClose: () => void;
}) {
  const editable = canEdit && !article.archivedAt;
  const [fullscreen, setFullscreen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [activeComment, setActiveComment] = useState<ActiveComment | null>(
    null,
  );
  const editorWrapRef = useRef<HTMLDivElement>(null);
  const comments = useArticleComments(article.id);

  const [title, setTitle] = useState(article.title);
  const [body, setBody] = useState(article.description ?? "");
  const [props, setProps] = useState({
    stage: isArticleStage(article.stage) ? article.stage : DEFAULT_ARTICLE_STAGE,
    categoryId: article.categoryId ?? "",
    eigenleistungRubrikId: article.eigenleistungRubrikId ?? "",
    publishAt: article.publishAt ?? "",
    assigneeId: article.assigneeId ?? "",
  });

  const { saveState, error, setError, queueChange, flush } = useAutosave(
    async (changes) => {
      const fd = new FormData();
      fd.set("id", article.id);
      for (const [k, v] of Object.entries(changes)) fd.set(k, v);
      return updateArticle(fd);
    },
  );

  const close = useCallback(() => {
    void flush();
    onClose();
  }, [flush, onClose]);

  const closeComment = useCallback(() => setActiveComment(null), []);
  const onEscape = useCallback(() => {
    if (!activeComment) return false;
    setActiveComment(null);
    return true;
  }, [activeComment]);

  function openThread(threadId: string) {
    const thread = comments.threads.find((t) => t.root.id === threadId);
    if (!thread || thread.root.resolvedAt) return;
    editorWrapRef.current
      ?.querySelector(`[data-comment="${CSS.escape(threadId)}"]`)
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
    setActiveComment({ kind: "thread", id: threadId });
  }

  // Only passages with an open thread are highlighted.
  const openThreadIds = comments.threads
    .filter((t) => !t.root.resolvedAt)
    .map((t) => t.root.id);
  const activeThreadId =
    activeComment?.kind === "thread" ? activeComment.id : null;
  const highlightCss = [
    openThreadIds.length > 0 &&
      `${openThreadIds.map((id) => `.article-comment-mark[data-comment="${CSS.escape(id)}"]`).join(",")}{background:color-mix(in oklab,var(--highlight) 45%,transparent);border-bottom:2px solid #e8c800;cursor:pointer}`,
    activeThreadId &&
      `.article-comment-mark[data-comment="${CSS.escape(activeThreadId)}"]{background:color-mix(in oklab,var(--highlight) 85%,transparent)}`,
  ]
    .filter(Boolean)
    .join("\n");

  function setProp<K extends keyof typeof props>(key: K, value: string) {
    setProps((p) => ({ ...p, [key]: value }));
    queueChange(key, value, true);
  }

  async function runAction(
    action: (fd: FormData) => Promise<{ error?: string } | { ok: true }>,
  ) {
    setBusy(true);
    await flush();
    const fd = new FormData();
    fd.set("id", article.id);
    const result = await action(fd);
    setBusy(false);
    if (result && "error" in result && result.error) {
      setError(result.error);
      return;
    }
    onClose();
  }

  const words = countWords(body);
  const stageColor = ARTICLE_STAGE_COLORS[props.stage];
  const category = categories.find((c) => c.id === props.categoryId);
  const rubrik = rubriken?.find((r) => r.id === props.eigenleistungRubrikId);

  return (
    <EditorDialogShell
      label="Artikel bearbeiten"
      meta={
        <>
          {createdMeta(article.createdAt, article.createdBy)}
          {article.archivedAt ? " · Archiviert" : ""}
        </>
      }
      saveState={saveState}
      fullscreen={fullscreen}
      onFullscreenChange={setFullscreen}
      onEscape={onEscape}
      onClose={close}
      menu={
        canEdit
          ? (closeMenu) => (
              <>
                {article.archivedAt ? (
                  <MenuItem
                    icon={<ArchiveRestore className="size-4" />}
                    disabled={busy}
                    onClick={() => {
                      closeMenu();
                      void runAction(unarchiveArticle);
                    }}
                  >
                    Wiederherstellen
                  </MenuItem>
                ) : (
                  <MenuItem
                    icon={<Archive className="size-4" />}
                    disabled={busy}
                    onClick={() => {
                      closeMenu();
                      void runAction(archiveArticle);
                    }}
                  >
                    Archivieren
                  </MenuItem>
                )}
                <MenuItem
                  icon={<Trash2 className="size-4" />}
                  danger
                  disabled={busy}
                  onClick={() => {
                    closeMenu();
                    if (
                      !confirm(
                        `Artikel «${title || article.title}» endgültig löschen?`,
                      )
                    ) {
                      return;
                    }
                    void runAction(deleteArticle);
                  }}
                >
                  Löschen
                </MenuItem>
              </>
            )
          : undefined
      }
      footerStart={`${words} ${words === 1 ? "Wort" : "Wörter"}`}
      footerEnd={
        editable
          ? "Änderungen werden automatisch gespeichert"
          : article.archivedAt
            ? "Archiviert – zum Bearbeiten wiederherstellen"
            : "Nur Lesezugriff"
      }
    >
      <EditorError message={error} />

      <TitleInput
        value={title}
        disabled={!editable}
        onChange={(v) => {
          setTitle(v);
          if (v.trim()) queueChange("title", v.trim());
        }}
      />

      {!fullscreen && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          <PillSelect
            label="Stage"
            value={props.stage}
            disabled={!editable}
            dot={stageColor}
            onChange={(v) => setProp("stage", v)}
            options={ARTICLE_STAGES.map((s) => ({
              id: s,
              name: ARTICLE_STAGE_LABELS[s],
            }))}
          />
          <PillSelect
            label="Kategorie"
            value={props.categoryId}
            disabled={!editable}
            color={category?.color}
            emptyLabel="Kategorie"
            onChange={(v) => setProp("categoryId", v)}
            options={categories.filter(
              (c) => c.active !== false || c.id === props.categoryId,
            )}
          />
          {rubriken && (
            <PillSelect
              label="Eigenleistungs-Rubrik"
              value={props.eigenleistungRubrikId}
              disabled={!editable}
              color={rubrik?.color}
              emptyLabel="Rubrik"
              onChange={(v) => setProp("eigenleistungRubrikId", v)}
              options={rubriken.filter(
                (r) => r.active !== false || r.id === props.eigenleistungRubrikId,
              )}
            />
          )}
          <PillDate
            label="Publikationsdatum"
            title="Publikationsdatum – erscheint im Programm-Kalender"
            value={props.publishAt}
            disabled={!editable}
            onChange={(v) => setProp("publishAt", v)}
          />
          <PillSelect
            label="Zuständig"
            value={props.assigneeId}
            disabled={!editable}
            emptyLabel="Zuständig"
            onChange={(v) => setProp("assigneeId", v)}
            options={members}
          />
        </div>
      )}

      {!fullscreen && (
        <CommentsSection state={comments} onOpenThread={openThread} />
      )}

      {highlightCss && <style>{highlightCss}</style>}
      <div ref={editorWrapRef} className="relative">
        <ArticleRichEditor
          initialMarkdown={article.description ?? ""}
          editable={editable}
          toolbarClassName="sticky top-0 z-10 mt-4"
          contentClassName="pt-4"
          onReady={setEditor}
          onStartComment={(selection) => {
            // Typing must go to the comment box, not into the text.
            // (Synchronous: Tiptap's blur command runs a frame later and
            // would steal focus back from the comment box.)
            editor?.view.dom.blur();
            setActiveComment({ kind: "new", selection });
          }}
          onCommentClick={openThread}
          onChange={(md) => {
            setBody(md);
            queueChange("description", md);
          }}
        />
        {activeComment && editor && (
          <ArticleCommentPopover
            active={activeComment}
            editor={editor}
            containerRef={editorWrapRef}
            state={comments}
            onClose={closeComment}
            onCreateThread={async (selection, text) => {
              const id = await comments.add({
                body: text,
                quote: selection.quote,
              });
              if (!id) return false;
              addCommentMark(editor, selection, id);
              setActiveComment({ kind: "thread", id });
              return true;
            }}
            onDeleteThread={async (threadId) => {
              if (await comments.remove(threadId)) {
                if (editable) removeCommentMark(editor, threadId);
                setActiveComment(null);
              }
            }}
          />
        )}
      </div>
    </EditorDialogShell>
  );
}
