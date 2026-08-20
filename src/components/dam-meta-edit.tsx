"use client";

import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { useState } from "react";
import { Check, Pencil, X } from "lucide-react";
import { uniqueKeywords } from "@/lib/dam/keywords";

export type DamMetaFieldKey =
  | "fileName"
  | "credit"
  | "rightsType"
  | "takenAt"
  | "altText"
  | "keywords"
  | "notes";

export function toDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function parseKeywords(value: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of value.split(",")) {
    const keyword = part.trim();
    if (!keyword) continue;
    const key = keyword.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(keyword.slice(0, 60));
  }
  return out.slice(0, 24);
}

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") {
    const type = (target as HTMLInputElement).type;
    return type !== "checkbox" && type !== "radio";
  }
  return target.isContentEditable;
}

export function DamMetaRow({
  label,
  display,
  displayNode,
  field,
  editing,
  onEdit,
  children,
}: {
  label: string;
  display: string;
  displayNode?: ReactNode;
  field: DamMetaFieldKey;
  editing: DamMetaFieldKey | null;
  onEdit: (field: DamMetaFieldKey) => void;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-[var(--muted)]">{label}</p>
        {editing !== field ? (
          <button
            type="button"
            className="rounded p-0.5 text-[var(--accent)] hover:bg-[var(--accent-soft)]"
            aria-label={`${label} bearbeiten`}
            onClick={() => onEdit(field)}
          >
            <Pencil className="size-3.5" />
          </button>
        ) : null}
      </div>
      {editing === field ? (
        children
      ) : (
        (displayNode ?? (
          <p className="mt-0.5 text-sm whitespace-pre-wrap">{display || "—"}</p>
        ))
      )}
    </div>
  );
}

export function DamEditControl({
  children,
  onSave,
}: {
  children: ReactNode;
  onSave: () => void;
}) {
  return (
    <div className="mt-1 flex items-start gap-1">
      <div className="field min-w-0 flex-1">{children}</div>
      <button
        type="button"
        className="btn btn-ghost mt-0.5 px-2"
        aria-label="Speichern"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onSave}
      >
        <Check className="size-3.5" />
      </button>
    </div>
  );
}

export function DamKeywordPills({
  keywords,
  onRemove,
  empty = true,
}: {
  keywords: string[];
  onRemove?: (keyword: string) => void;
  empty?: boolean;
}) {
  if (keywords.length === 0) {
    if (!empty) return null;
    return <p className="mt-0.5 text-sm text-[var(--muted)]">—</p>;
  }
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {keywords.map((keyword) => (
        <span
          key={keyword}
          className="inline-flex max-w-full items-center gap-0.5 rounded-full bg-[var(--accent-soft)] py-0.5 pl-2 pr-0.5 text-xs font-semibold"
        >
          <span className="truncate">{keyword}</span>
          {onRemove ? (
            <button
              type="button"
              className="rounded-full p-0.5 hover:bg-white/70"
              aria-label={`${keyword} entfernen`}
              onClick={() => onRemove(keyword)}
            >
              <X className="size-2.5" />
            </button>
          ) : null}
        </span>
      ))}
    </div>
  );
}

export function DamKeywordEditor({
  id,
  keywords,
  onChange,
  disabled,
  placeholder = "Keyword hinzufügen…",
}: {
  id?: string;
  keywords: string[];
  onChange: (keywords: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");

  function commit(raw: string) {
    const next = uniqueKeywords([...keywords, ...raw.split(/[,;]/)]);
    if (next.length !== keywords.length || raw.trim()) {
      onChange(next);
    }
    setDraft("");
  }

  return (
    <div className="space-y-1">
      <DamKeywordPills
        keywords={keywords}
        empty={false}
        onRemove={
          disabled
            ? undefined
            : (keyword) => onChange(keywords.filter((item) => item !== keyword))
        }
      />
      <input
        id={id}
        disabled={disabled}
        value={draft}
        maxLength={60}
        placeholder={placeholder}
        onChange={(e) => {
          const value = e.target.value;
          if (/[,;]/.test(value)) {
            commit(value);
            return;
          }
          setDraft(value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit(draft);
          }
        }}
        onBlur={() => commit(draft)}
      />
    </div>
  );
}

export function damMetaDraftKey(
  e: ReactKeyboardEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  onSave: () => void,
  onCancel: () => void,
) {
  if (e.key === "Enter" && e.currentTarget.tagName !== "TEXTAREA") {
    e.preventDefault();
    onSave();
  }
  if (e.key === "Escape") {
    e.preventDefault();
    e.stopPropagation();
    onCancel();
  }
}
