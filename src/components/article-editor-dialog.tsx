"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import {
  Archive,
  ArchiveRestore,
  Calendar,
  Check,
  ChevronDown,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  Trash2,
  X,
} from "lucide-react";
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
  ArticleRichEditor,
  countWords,
} from "@/components/article-rich-editor";
import { ArticleComments } from "@/components/article-comments";

const AUTOSAVE_MS = 800;

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

type Option = { id: string; name: string; color?: string; active?: boolean };
type SaveState = "idle" | "pending" | "saving" | "saved" | "error";
type Field =
  | "title"
  | "description"
  | "stage"
  | "categoryId"
  | "eigenleistungRubrikId"
  | "publishAt"
  | "assigneeId";

export function ArticleEditorDialog({
  article,
  members,
  categories,
  rubriken,
  canEdit,
  onClose,
}: {
  article: EditorArticle | null;
  members: Option[];
  categories: Option[];
  /** Omit to hide the Eigenleistungs-Rubrik property. */
  rubriken?: Option[];
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
  members: Option[];
  categories: Option[];
  rubriken?: Option[];
  canEdit: boolean;
  onClose: () => void;
}) {
  const editable = canEdit && !article.archivedAt;
  const [visible, setVisible] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [title, setTitle] = useState(article.title);
  const [body, setBody] = useState(article.description ?? "");
  const [props, setProps] = useState({
    stage: isArticleStage(article.stage) ? article.stage : DEFAULT_ARTICLE_STAGE,
    categoryId: article.categoryId ?? "",
    eigenleistungRubrikId: article.eigenleistungRubrikId ?? "",
    publishAt: article.publishAt ?? "",
    assigneeId: article.assigneeId ?? "",
  });

  // Pending text changes; saves run one after another so they land in order.
  const pendingRef = useRef<Partial<Record<Field, string>>>({});
  const timerRef = useRef<number | null>(null);
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  const flush = useCallback(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const changes = pendingRef.current;
    pendingRef.current = {};
    if (Object.keys(changes).length === 0) return queueRef.current;
    queueRef.current = queueRef.current.then(async () => {
      setSaveState("saving");
      const fd = new FormData();
      fd.set("id", article.id);
      for (const [k, v] of Object.entries(changes)) fd.set(k, v ?? "");
      try {
        const result = await updateArticle(fd);
        if (result && "error" in result && result.error) {
          setError(result.error);
          setSaveState("error");
          return;
        }
        setError(null);
        setSaveState(
          Object.keys(pendingRef.current).length > 0 ? "pending" : "saved",
        );
      } catch {
        setError("Speichern fehlgeschlagen. Verbindung prüfen.");
        setSaveState("error");
        pendingRef.current = { ...changes, ...pendingRef.current };
      }
    });
    return queueRef.current;
  }, [article.id]);

  const queueChange = useCallback(
    (field: Field, value: string, immediate = false) => {
      pendingRef.current[field] = value;
      setSaveState("pending");
      if (timerRef.current) window.clearTimeout(timerRef.current);
      if (immediate) {
        void flush();
      } else {
        timerRef.current = window.setTimeout(() => void flush(), AUTOSAVE_MS);
      }
    },
    [flush],
  );

  const close = useCallback(() => {
    void flush();
    onClose();
  }, [flush, onClose]);

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (menuOpen) setMenuOpen(false);
      else if (fullscreen) setFullscreen(false);
      else close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen, fullscreen, close]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (Object.keys(pendingRef.current).length > 0) e.preventDefault();
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      void flush();
    };
  }, [flush]);

  function setProp<K extends keyof typeof props>(key: K, value: string) {
    setProps((p) => ({ ...p, [key]: value }));
    queueChange(key, value, true);
  }

  async function runAction(
    action: (fd: FormData) => Promise<{ error?: string } | { ok: true }>,
  ) {
    setMenuOpen(false);
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
    <div
      className={[
        "fixed inset-0 z-50 flex items-center justify-center",
        fullscreen ? "" : "sm:p-6",
      ].join(" ")}
      role="dialog"
      aria-modal="true"
      aria-label="Artikel bearbeiten"
    >
      <button
        type="button"
        aria-label="Schliessen"
        tabIndex={-1}
        className={[
          "absolute inset-0 bg-black/40 transition-opacity duration-200",
          visible ? "opacity-100" : "opacity-0",
        ].join(" ")}
        onClick={close}
      />
      <div
        className={[
          "relative flex h-dvh w-full flex-col overflow-hidden bg-[var(--bg-elevated)] transition duration-200 ease-out",
          fullscreen
            ? "max-w-none"
            : "sm:h-[min(90dvh,960px)] sm:max-w-4xl sm:rounded-[var(--radius)] sm:border sm:border-[var(--border)] sm:shadow-[0_24px_80px_rgba(0,0,0,0.25)]",
          visible ? "scale-100 opacity-100" : "scale-[0.98] opacity-0",
        ].join(" ")}
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] px-3 py-2 sm:px-4">
          <p className="min-w-0 truncate text-xs text-[var(--muted)]">
            Erstellt{" "}
            {format(new Date(article.createdAt), "d. MMM yyyy", { locale: de })}{" "}
            · {article.createdBy.name}
            {article.archivedAt ? " · Archiviert" : ""}
          </p>
          <div className="flex shrink-0 items-center gap-0.5">
            <SaveIndicator state={saveState} />
            <IconButton
              label={fullscreen ? "Vollbild verlassen (Esc)" : "Vollbild"}
              onClick={() => setFullscreen((f) => !f)}
            >
              {fullscreen ? (
                <Minimize2 className="size-4" />
              ) : (
                <Maximize2 className="size-4" />
              )}
            </IconButton>
            {canEdit && (
              <div className="relative">
                <IconButton
                  label="Weitere Aktionen"
                  onClick={() => setMenuOpen((o) => !o)}
                >
                  <MoreHorizontal className="size-4" />
                </IconButton>
                {menuOpen && (
                  <>
                    <button
                      type="button"
                      aria-hidden
                      tabIndex={-1}
                      className="fixed inset-0 z-10 cursor-default"
                      onClick={() => setMenuOpen(false)}
                    />
                    <div className="absolute top-full right-0 z-20 mt-1 w-48 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-1 shadow-[var(--shadow)]">
                      {article.archivedAt ? (
                        <MenuItem
                          icon={<ArchiveRestore className="size-4" />}
                          disabled={busy}
                          onClick={() => runAction(unarchiveArticle)}
                        >
                          Wiederherstellen
                        </MenuItem>
                      ) : (
                        <MenuItem
                          icon={<Archive className="size-4" />}
                          disabled={busy}
                          onClick={() => runAction(archiveArticle)}
                        >
                          Archivieren
                        </MenuItem>
                      )}
                      <MenuItem
                        icon={<Trash2 className="size-4" />}
                        danger
                        disabled={busy}
                        onClick={() => {
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
                    </div>
                  </>
                )}
              </div>
            )}
            <IconButton label="Schliessen (Esc)" onClick={close}>
              <X className="size-4" />
            </IconButton>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div
            className={[
              "mx-auto w-full px-4 pt-5 pb-16 sm:px-8",
              fullscreen ? "max-w-[46rem] sm:pt-12" : "max-w-3xl",
            ].join(" ")}
          >
            {error && (
              <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-[var(--danger)]">
                {error}
              </p>
            )}

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
                      (r) =>
                        r.active !== false ||
                        r.id === props.eigenleistungRubrikId,
                    )}
                  />
                )}
                <PillDate
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

            {!fullscreen && <ArticleComments articleId={article.id} />}

            <ArticleRichEditor
              initialMarkdown={article.description ?? ""}
              editable={editable}
              toolbarClassName="sticky top-0 z-10 mt-4"
              contentClassName="pt-4"
              onChange={(md) => {
                setBody(md);
                queueChange("description", md);
              }}
            />
          </div>
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted)] sm:px-4">
          <span>
            {words} {words === 1 ? "Wort" : "Wörter"}
          </span>
          <span className="hidden sm:inline">
            {editable
              ? "Änderungen werden automatisch gespeichert"
              : article.archivedAt
                ? "Archiviert – zum Bearbeiten wiederherstellen"
                : "Nur Lesezugriff"}
          </span>
        </footer>
      </div>
    </div>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === "idle") return null;
  const label =
    state === "error"
      ? "Nicht gespeichert"
      : state === "saved"
        ? "Gespeichert"
        : "Speichert…";
  return (
    <span
      className={[
        "mr-1 inline-flex items-center gap-1 text-xs",
        state === "error" ? "text-[var(--danger)]" : "text-[var(--muted)]",
      ].join(" ")}
      aria-live="polite"
    >
      {state === "saved" && <Check className="size-3.5" />}
      {label}
    </span>
  );
}

function TitleInput({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    function fit() {
      const el = ref.current;
      if (!el) return;
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
    fit();
    // Re-measure once the display font has loaded and when the width changes.
    void document.fonts?.ready.then(fit);
    let width = 0;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry || entry.contentRect.width === width) return;
      width = entry.contentRect.width;
      fit();
    });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      maxLength={200}
      disabled={disabled}
      aria-label="Titel"
      placeholder="Titel"
      onChange={(e) => onChange(e.target.value.replace(/\n/g, " "))}
      // Inline font: the global `textarea { font: inherit }` beats utilities.
      style={{
        font: "600 clamp(1.5rem, 1.2rem + 1.2vw, 1.9rem) / 1.2 var(--font-display), system-ui, sans-serif",
      }}
      className="block w-full resize-none overflow-hidden border-0 bg-transparent p-0 tracking-tight outline-none placeholder:text-[var(--muted)] disabled:bg-transparent"
    />
  );
}

const pillClass =
  "relative inline-flex h-7 max-w-full items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors";

function PillSelect({
  label,
  value,
  options,
  disabled,
  emptyLabel,
  color,
  dot,
  onChange,
}: {
  label: string;
  value: string;
  options: Option[];
  disabled: boolean;
  emptyLabel?: string;
  color?: string;
  dot?: string;
  onChange: (value: string) => void;
}) {
  const current = options.find((o) => o.id === value);
  const empty = !current;
  return (
    <label
      className={[
        pillClass,
        empty
          ? "border-dashed border-[var(--border)] text-[var(--muted)]"
          : "border-[var(--border)] text-[var(--fg)]",
        disabled ? "" : "cursor-pointer hover:border-[var(--fg)]",
      ].join(" ")}
      style={
        color
          ? {
              background: `color-mix(in oklab, ${color} 30%, white)`,
              borderColor: color,
            }
          : undefined
      }
      title={label}
    >
      {dot && (
        <span
          className="size-2 shrink-0 rounded-full"
          style={{ background: dot }}
          aria-hidden
        />
      )}
      <span className="truncate">{current?.name ?? emptyLabel ?? "—"}</span>
      {!disabled && <ChevronDown className="size-3 shrink-0 opacity-60" />}
      <select
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-default"
      >
        {emptyLabel !== undefined && <option value="">— keine —</option>}
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function PillDate({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <span
      className={[
        pillClass,
        value
          ? "border-[var(--border)] text-[var(--fg)]"
          : "border-dashed border-[var(--border)] text-[var(--muted)]",
      ].join(" ")}
      title="Publikationsdatum – erscheint im Programm-Kalender"
    >
      <Calendar className="size-3.5 shrink-0" />
      <span>
        {value
          ? format(new Date(`${value}T12:00:00`), "EEE d. MMM yyyy", {
              locale: de,
            })
          : "Publikationsdatum"}
      </span>
      {value && !disabled && (
        <button
          type="button"
          aria-label="Datum entfernen"
          className="relative z-10 -mr-1 rounded-full p-0.5 hover:bg-black/10"
          onClick={() => onChange("")}
        >
          <X className="size-3" />
        </button>
      )}
      <input
        type="date"
        aria-label="Publikationsdatum"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onClick={(e) => e.currentTarget.showPicker?.()}
        className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-default"
      />
    </span>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="inline-flex size-8 items-center justify-center rounded-md text-[var(--fg)] transition-colors hover:bg-black/5"
    >
      {children}
    </button>
  );
}

function MenuItem({
  icon,
  danger,
  disabled,
  onClick,
  children,
}: {
  icon: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={[
        "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-black/5 disabled:opacity-50",
        danger ? "text-[var(--danger)]" : "text-[var(--fg)]",
      ].join(" ")}
    >
      {icon}
      {children}
    </button>
  );
}
