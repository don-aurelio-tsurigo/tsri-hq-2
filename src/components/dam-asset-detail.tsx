"use client";

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { Check, ChevronLeft, ChevronRight, Pencil, X } from "lucide-react";
import { DamCombobox } from "@/components/dam-combobox";
import { DamRatingStars } from "@/components/dam-rating-stars";
import { cssPreviewStyle } from "@/lib/dam/edit-params";
import { DAM_RIGHTS_OPTIONS, damWepublishExportedHint } from "@/lib/dam/types";
import type { AssetMetadataPatch, PersonalAssetCard } from "@/lib/dam/types";

type FieldKey =
  | "fileName"
  | "credit"
  | "rightsType"
  | "takenAt"
  | "altText"
  | "keywords"
  | "notes";

function rightsLabel(value: string): string {
  return DAM_RIGHTS_OPTIONS.find((opt) => opt.value === value)?.label ?? value;
}

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function parseKeywords(value: string): string[] {
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

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") {
    const type = (target as HTMLInputElement).type;
    return type !== "checkbox" && type !== "radio";
  }
  return target.isContentEditable;
}

function MetaRow({
  label,
  display,
  field,
  editing,
  onEdit,
  children,
}: {
  label: string;
  display: string;
  field: FieldKey;
  editing: FieldKey | null;
  onEdit: (field: FieldKey) => void;
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
        <p className="mt-0.5 text-sm whitespace-pre-wrap">{display || "—"}</p>
      )}
    </div>
  );
}

function EditControl({
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

export function DamAssetDetail({
  assets,
  index,
  allCollections,
  onIndexChange,
  onClose,
  onRate,
  onEdit,
  onPatch,
  onSetCollections,
  onCreateCollection,
  keyboardEnabled = true,
}: {
  assets: PersonalAssetCard[];
  index: number;
  allCollections: { id: string; name: string }[];
  onIndexChange: (index: number) => void;
  onClose: () => void;
  onRate: (assetId: string, rating: number) => void;
  onEdit: () => void;
  onPatch: (assetId: string, patch: AssetMetadataPatch) => void;
  onSetCollections: (assetId: string, collectionIds: string[]) => void;
  onCreateCollection?: (
    name: string,
  ) => Promise<{ value: string; label: string } | null>;
  keyboardEnabled?: boolean;
}) {
  const asset = assets[index];
  const count = assets.length;
  const [editing, setEditing] = useState<FieldKey | null>(null);
  const [draft, setDraft] = useState("");
  const skipBlur = useRef(false);

  useEffect(() => {
    setEditing(null);
    setDraft("");
  }, [asset?.id]);

  function startEdit(field: FieldKey) {
    if (!asset) return;
    skipBlur.current = false;
    setEditing(field);
    if (field === "keywords") setDraft(asset.keywords.join(", "));
    else if (field === "takenAt") setDraft(toDatetimeLocal(asset.takenAt));
    else if (field === "altText") setDraft(asset.altText ?? "");
    else if (field === "notes") setDraft(asset.notes ?? "");
    else if (field === "fileName") setDraft(asset.fileName);
    else if (field === "credit") setDraft(asset.credit);
    else setDraft(asset.rightsType);
  }

  function cancelEdit() {
    skipBlur.current = true;
    setEditing(null);
    setDraft("");
  }

  function saveField(field: FieldKey = editing ?? "fileName") {
    if (!asset) return;
    const value = draft.trim();
    let patch: AssetMetadataPatch | null = null;
    if (field === "fileName") {
      const fileName = value.replace(/[/\\]/g, "");
      if (!fileName) return;
      patch = { fileName };
    } else if (field === "credit") {
      if (!value) return;
      patch = { credit: value };
    } else if (field === "rightsType") {
      if (value !== "own" && value !== "provided" && value !== "free_use") return;
      patch = { rightsType: value };
    } else if (field === "altText") {
      patch = { altText: value || null };
    } else if (field === "keywords") {
      patch = { keywords: parseKeywords(draft) };
    } else if (field === "notes") {
      patch = { notes: value || null };
    } else if (field === "takenAt") {
      patch = { takenAt: value ? new Date(value).toISOString() : null };
    }
    if (!patch) return;
    onPatch(asset.id, patch);
    setEditing(null);
    setDraft("");
  }

  function onDraftKey(e: ReactKeyboardEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    if (e.key === "Enter" && e.currentTarget.tagName !== "TEXTAREA") {
      e.preventDefault();
      saveField();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      cancelEdit();
    }
  }

  function onDraftBlur() {
    if (skipBlur.current) {
      skipBlur.current = false;
      return;
    }
    if (editing) saveField(editing);
  }

  useEffect(() => {
    if (!keyboardEnabled) return;

    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (editing || isTypingTarget(e.target)) {
        if (e.key === "Escape" && editing) {
          e.preventDefault();
          cancelEdit();
        }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        onIndexChange((index - 1 + count) % count);
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        onIndexChange((index + 1) % count);
        return;
      }
      if (e.key === "e" || e.key === "E") {
        e.preventDefault();
        onEdit();
        return;
      }
      if (e.key >= "1" && e.key <= "5" && asset) {
        e.preventDefault();
        onRate(asset.id, Number(e.key));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [asset, count, editing, index, keyboardEnabled, onClose, onEdit, onIndexChange, onRate]);

  if (!asset) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex bg-black/55 p-3 sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dam-detail-title"
      onClick={onClose}
    >
      <div
        className="card mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col overflow-hidden lg:flex-row"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative flex min-h-[50vh] flex-1 flex-col bg-[#111]">
          <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-4">
            <div className="inline-block max-h-full max-w-full overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/dam/assets/${asset.id}/file?variant=web`}
                alt={asset.altText || asset.fileName}
                className="block max-h-[70vh] max-w-full object-contain"
                style={cssPreviewStyle(asset.editParams, asset)}
              />
            </div>
            {count > 1 ? (
              <>
                <button
                  type="button"
                  className="absolute top-1/2 left-3 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-[var(--fg)] shadow"
                  aria-label="Vorheriges Bild"
                  onClick={() => onIndexChange((index - 1 + count) % count)}
                >
                  <ChevronLeft className="size-6" />
                </button>
                <button
                  type="button"
                  className="absolute top-1/2 right-3 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-[var(--fg)] shadow"
                  aria-label="Nächstes Bild"
                  onClick={() => onIndexChange((index + 1) % count)}
                >
                  <ChevronRight className="size-6" />
                </button>
              </>
            ) : null}
          </div>
          <div className="flex items-center justify-between gap-3 px-4 py-3 text-white">
            <p className="text-sm text-white/70">
              {index + 1} / {count}
            </p>
            <button type="button" className="btn btn-highlight" onClick={onEdit}>
              <Pencil className="size-4" aria-hidden />
              Bild bearbeiten
            </button>
          </div>
        </div>

        <aside className="flex w-full shrink-0 flex-col overflow-y-auto border-t border-[var(--border)] lg:w-[22rem] lg:border-t-0 lg:border-l">
          <div className="flex items-start justify-between gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold tracking-wide text-[var(--accent)] uppercase">
                Details
              </p>
              {editing === "fileName" ? (
                <EditControl onSave={() => saveField("fileName")}>
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={onDraftKey}
                    onBlur={onDraftBlur}
                    autoFocus
                    aria-label="Dateiname"
                  />
                </EditControl>
              ) : (
                <div className="mt-1 flex items-start gap-1">
                  <h2
                    id="dam-detail-title"
                    className="min-w-0 flex-1 break-all font-[family-name:var(--font-display)] text-base font-semibold"
                  >
                    {asset.fileName}
                  </h2>
                  <button
                    type="button"
                    className="shrink-0 rounded p-0.5 text-[var(--accent)] hover:bg-[var(--accent-soft)]"
                    aria-label="Dateiname bearbeiten"
                    onClick={() => startEdit("fileName")}
                  >
                    <Pencil className="size-3.5" />
                  </button>
                </div>
              )}
            </div>
            <button
              type="button"
              className="btn btn-ghost shrink-0 px-2"
              onClick={onClose}
              aria-label="Schliessen"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="space-y-4 px-4 pb-5">
            <div>
              <p className="mb-1 text-xs font-semibold text-[var(--muted)]">Rating</p>
              <DamRatingStars
                rating={asset.rating}
                onRate={(n) => onRate(asset.id, n)}
                size="md"
              />
            </div>

            {asset.lastWepublishExportedAt ? (
              <p className="text-sm text-[var(--muted)]">
                {damWepublishExportedHint(asset.lastWepublishExportedAt)}
              </p>
            ) : null}

            <DamCombobox
              id={`detail-collections-${asset.id}`}
              label="Collection"
              emptyLabel="Collection zuweisen…"
              placeholder="Collection suchen…"
              options={allCollections.map((collection) => ({
                value: collection.id,
                label: collection.name,
              }))}
              value={asset.collections.map((collection) => collection.id)}
              multiple
              onCreate={onCreateCollection}
              onChange={(ids) => onSetCollections(asset.id, ids)}
            />

            <MetaRow
              label="Credit"
              display={asset.credit}
              field="credit"
              editing={editing}
              onEdit={startEdit}
            >
              <EditControl onSave={() => saveField("credit")}>
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={onDraftKey}
                  onBlur={onDraftBlur}
                  autoFocus
                  aria-label="Credit"
                />
              </EditControl>
            </MetaRow>

            <MetaRow
              label="Rechte"
              display={rightsLabel(asset.rightsType)}
              field="rightsType"
              editing={editing}
              onEdit={startEdit}
            >
              <EditControl onSave={() => saveField("rightsType")}>
                <select
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={onDraftKey}
                  onBlur={onDraftBlur}
                  autoFocus
                  aria-label="Rechte"
                >
                  {DAM_RIGHTS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </EditControl>
            </MetaRow>

            {asset.width && asset.height ? (
              <div>
                <p className="text-xs font-semibold text-[var(--muted)]">Masse</p>
                <p className="mt-0.5 text-sm">
                  {asset.width} × {asset.height}
                </p>
              </div>
            ) : null}

            <MetaRow
              label="Aufgenommen"
              display={
                asset.takenAt ? new Date(asset.takenAt).toLocaleString("de-CH") : ""
              }
              field="takenAt"
              editing={editing}
              onEdit={startEdit}
            >
              <EditControl onSave={() => saveField("takenAt")}>
                <input
                  type="datetime-local"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={onDraftKey}
                  onBlur={onDraftBlur}
                  autoFocus
                  aria-label="Aufgenommen"
                />
              </EditControl>
            </MetaRow>

            <MetaRow
              label="Alt-Text"
              display={asset.altText ?? ""}
              field="altText"
              editing={editing}
              onEdit={startEdit}
            >
              <EditControl onSave={() => saveField("altText")}>
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={onDraftKey}
                  onBlur={onDraftBlur}
                  rows={3}
                  autoFocus
                  aria-label="Alt-Text"
                />
              </EditControl>
            </MetaRow>

            <MetaRow
              label="Keywords"
              display={asset.keywords.join(", ")}
              field="keywords"
              editing={editing}
              onEdit={startEdit}
            >
              <EditControl onSave={() => saveField("keywords")}>
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={onDraftKey}
                  onBlur={onDraftBlur}
                  placeholder="zürich, velo, podium"
                  autoFocus
                  aria-label="Keywords"
                />
              </EditControl>
            </MetaRow>

            <MetaRow
              label="Kontext"
              display={asset.notes ?? ""}
              field="notes"
              editing={editing}
              onEdit={startEdit}
            >
              <EditControl onSave={() => saveField("notes")}>
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={onDraftKey}
                  onBlur={onDraftBlur}
                  rows={4}
                  maxLength={4000}
                  placeholder="Ereignis, Hintergrund, beteiligte Personen…"
                  autoFocus
                  aria-label="Kontext"
                />
              </EditControl>
            </MetaRow>

            <p className="text-xs text-[var(--muted)]">
              Stift zum Bearbeiten, Enter speichert, Esc bricht ab. ← → blättern,
              1–5 bewerten, E Bildeditor.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
