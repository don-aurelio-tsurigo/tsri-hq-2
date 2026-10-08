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
  Calendar,
  Check,
  ChevronDown,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  X,
} from "lucide-react";

/*
 * Shared building blocks for the centered, Notion-like editors
 * (articles, tasks): autosave, dialog shell, title, property pills.
 */

const AUTOSAVE_MS = 800;

export type SaveState = "idle" | "pending" | "saving" | "saved" | "error";
export type SaveResult = { error?: string } | { ok: true } | undefined;

/**
 * Collects field changes and saves them through `save`: text after a short
 * pause, properties immediately. Saves run one after another so they land in
 * order; pending changes are flushed on close and unmount.
 */
export function useAutosave(
  save: (changes: Record<string, string>) => Promise<SaveResult>,
) {
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const pendingRef = useRef<Record<string, string>>({});
  const timerRef = useRef<number | null>(null);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });

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
      try {
        const result = await saveRef.current(changes);
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
  }, []);

  const queueChange = useCallback(
    (field: string, value: string, immediate = false) => {
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

  return { saveState, error, setError, queueChange, flush };
}

/**
 * Centered dialog (full screen on phones) with header actions, optional
 * fullscreen writing mode and a status footer.
 */
export function EditorDialogShell({
  label,
  meta,
  saveState,
  fullscreen,
  onFullscreenChange,
  menu,
  footerStart,
  footerEnd,
  onEscape,
  onClose,
  children,
}: {
  label: string;
  meta: ReactNode;
  saveState: SaveState;
  fullscreen: boolean;
  onFullscreenChange: (fullscreen: boolean) => void;
  /** Items of the «···» menu; receives a callback that closes the menu. */
  menu?: (closeMenu: () => void) => ReactNode;
  footerStart?: ReactNode;
  footerEnd?: ReactNode;
  /** Return true when Escape was handled inside (e.g. a popover closed). */
  onEscape?: () => boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const [visible, setVisible] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (onEscape?.()) return;
      if (menuOpen) setMenuOpen(false);
      else if (fullscreen) onFullscreenChange(false);
      else onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onEscape, menuOpen, fullscreen, onFullscreenChange, onClose]);

  return (
    <div
      className={[
        "fixed inset-0 z-50 flex items-center justify-center",
        fullscreen ? "" : "sm:p-6",
      ].join(" ")}
      role="dialog"
      aria-modal="true"
      aria-label={label}
    >
      <button
        type="button"
        aria-label="Schliessen"
        tabIndex={-1}
        className={[
          "absolute inset-0 bg-black/40 transition-opacity duration-200",
          visible ? "opacity-100" : "opacity-0",
        ].join(" ")}
        onClick={onClose}
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
          <div className="min-w-0 truncate text-xs text-[var(--muted)]">
            {meta}
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <SaveIndicator state={saveState} />
            <IconButton
              label={fullscreen ? "Vollbild verlassen (Esc)" : "Vollbild"}
              onClick={() => onFullscreenChange(!fullscreen)}
            >
              {fullscreen ? (
                <Minimize2 className="size-4" />
              ) : (
                <Maximize2 className="size-4" />
              )}
            </IconButton>
            {menu && (
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
                      {menu(() => setMenuOpen(false))}
                    </div>
                  </>
                )}
              </div>
            )}
            <IconButton label="Schliessen (Esc)" onClick={onClose}>
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
            {children}
          </div>
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted)] sm:px-4">
          <span>{footerStart}</span>
          <span className="hidden sm:inline">{footerEnd}</span>
        </footer>
      </div>
    </div>
  );
}

export function EditorError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-[var(--danger)]">
      {message}
    </p>
  );
}

export function createdMeta(
  createdAt: string | Date | undefined,
  createdBy: { name: string } | null | undefined,
) {
  if (!createdAt) return null;
  return `Erstellt ${format(new Date(createdAt), "d. MMM yyyy", { locale: de })}${
    createdBy ? ` · ${createdBy.name}` : ""
  }`;
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

export function TitleInput({
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

export type PillOption = {
  id: string;
  name: string;
  color?: string;
  active?: boolean;
};

export const pillClass =
  "relative inline-flex h-7 max-w-full items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors";

export function PillSelect({
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
  options: PillOption[];
  disabled: boolean;
  /** Set to allow clearing; shown while nothing is selected. */
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

export function PillDate({
  label,
  title,
  value,
  disabled,
  onChange,
}: {
  label: string;
  title?: string;
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
      title={title ?? label}
    >
      <Calendar className="size-3.5 shrink-0" />
      <span>
        {value
          ? format(new Date(`${value}T12:00:00`), "EEE d. MMM yyyy", {
              locale: de,
            })
          : label}
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
        aria-label={label}
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

export function MenuItem({
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
