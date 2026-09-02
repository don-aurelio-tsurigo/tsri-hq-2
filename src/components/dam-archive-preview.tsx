"use client";

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Download, Pencil, Send, Trash2, X } from "lucide-react";
import { DamCombobox } from "@/components/dam-combobox";
import {
  DamEditControl,
  DamKeywordPills,
  DamMetaRow,
  damMetaDraftKey,
  isTypingTarget,
  parseKeywords,
  toDatetimeLocal,
  type DamMetaFieldKey,
} from "@/components/dam-meta-edit";
import { DamRatingStars } from "@/components/dam-rating-stars";
import { useToast } from "@/components/toast";
import { archiveCollectionHref } from "@/lib/dam/archive-filters";
import { downloadPublishedAssets } from "@/lib/dam/browser-download";
import { damFileSrc } from "@/lib/dam/edit-params";
import {
  DAM_RIGHTS_OPTIONS,
  damRightsLabel,
  damWepublishExportedHint,
  type ArchiveAssetCard,
  type AssetMetadataPatch,
} from "@/lib/dam/types";

function formatTakenAt(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("de-CH");
}

export function DamArchivePreview({
  assets,
  index,
  allCollections,
  onIndexChange,
  onClose,
  onTrash,
  onWepublishExported,
  onPatch,
  onSetCollections,
  onCreateCollection,
  collectionsRemote = false,
  keyboardEnabled = true,
  onEdit,
}: {
  assets: ArchiveAssetCard[];
  index: number;
  allCollections: { id: string; name: string }[];
  onIndexChange: (index: number) => void;
  onClose: () => void;
  onTrash?: (assetId: string) => void;
  onWepublishExported?: (assetId: string, exportedAt: string) => void;
  onPatch: (assetId: string, patch: AssetMetadataPatch) => void;
  onSetCollections: (assetId: string, collectionIds: string[]) => void;
  onCreateCollection: (
    name: string,
  ) => Promise<{ value: string; label: string } | null>;
  collectionsRemote?: boolean;
  keyboardEnabled?: boolean;
  onEdit: () => void;
}) {
  const asset = assets[index];
  const count = assets.length;
  const { showToast } = useToast();
  const skipBlur = useRef(false);
  const [editing, setEditing] = useState<DamMetaFieldKey | null>(null);
  const [draft, setDraft] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);
  const [seenId, setSeenId] = useState(asset?.id);
  if (asset?.id !== seenId) {
    setSeenId(asset?.id);
    setDownloadError(null);
    setDownloading(false);
    setExportError(null);
    setExportSuccess(null);
    setExporting(false);
    setEditing(null);
    setDraft("");
  }

  function startEdit(field: DamMetaFieldKey) {
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

  function saveField(field: DamMetaFieldKey = editing ?? "fileName") {
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

  function onDraftKey(
    e: ReactKeyboardEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) {
    damMetaDraftKey(e, saveField, cancelEdit);
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
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [count, editing, index, keyboardEnabled, onClose, onEdit, onIndexChange]);

  async function downloadOriginal() {
    if (!asset || downloading) return;
    setDownloadError(null);
    setDownloading(true);
    try {
      await downloadPublishedAssets([asset.id]);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : "Download fehlgeschlagen.");
    } finally {
      setDownloading(false);
    }
  }

  async function sendToWepublish() {
    if (!asset || exporting) return;
    setExportError(null);
    setExportSuccess(null);
    setExporting(true);
    try {
      const res = await fetch("/api/dam/export-wepublish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId: asset.id }),
      });
      const data = (await res.json()) as {
        error?: string;
        exportedAt?: string;
        imageUrl?: string;
      };
      if (!res.ok || !data.exportedAt) {
        throw new Error(data.error || "Senden an WePublish fehlgeschlagen.");
      }
      onWepublishExported?.(asset.id, data.exportedAt);
      const message = "Bild an WePublish gesendet.";
      setExportSuccess(message);
      showToast({ message });
    } catch (err) {
      setExportError(
        err instanceof Error ? err.message : "Senden an WePublish fehlgeschlagen.",
      );
    } finally {
      setExporting(false);
    }
  }

  if (!asset) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex bg-black/55 p-3 sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dam-archive-preview-title"
      onClick={onClose}
    >
      <div
        className="card mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col overflow-hidden lg:flex-row"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative flex min-h-[50vh] flex-1 flex-col bg-[#111]">
          <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={damFileSrc(asset.id, "web", asset.editParams)}
              alt={asset.altText || asset.fileName}
              className="max-h-[70vh] max-w-full object-contain"
            />
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
              {count > 1 ? `${index + 1} / ${count}` : "\u00a0"}
            </p>
            <button type="button" className="btn btn-highlight" onClick={onEdit}>
              <Pencil className="size-4" aria-hidden />
              Bild bearbeiten
            </button>
          </div>
        </div>

        <aside className="flex w-full shrink-0 flex-col overflow-hidden border-t border-[var(--border)] lg:w-[22rem] lg:border-t-0 lg:border-l">
          <div className="flex items-start justify-between gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold tracking-wide text-[var(--accent)] uppercase">
                Archiv
              </p>
              {editing === "fileName" ? (
                <DamEditControl onSave={() => saveField("fileName")}>
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={onDraftKey}
                    onBlur={onDraftBlur}
                    autoFocus
                    aria-label="Dateiname"
                  />
                </DamEditControl>
              ) : (
                <div className="mt-1 flex items-start gap-1">
                  <h2
                    id="dam-archive-preview-title"
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
              aria-label="Schliessen"
              onClick={onClose}
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-5">
            <DamRatingStars rating={asset.rating} />

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className="btn btn-primary px-3 py-2 text-sm"
                disabled={downloading}
                onClick={downloadOriginal}
              >
                <Download className="size-3.5 shrink-0" aria-hidden />
                {downloading ? "Lädt…" : "Herunterladen"}
              </button>
              <button
                type="button"
                className="btn btn-primary px-3 py-2 text-sm"
                disabled={exporting}
                onClick={() => void sendToWepublish()}
              >
                <Send className="size-3.5 shrink-0" aria-hidden />
                {exporting ? "Sendet…" : "WePublish"}
              </button>
            </div>
            {downloadError ? (
              <p className="text-sm text-red-600">{downloadError}</p>
            ) : null}
            {exportError ? (
              <p className="text-sm text-red-600">{exportError}</p>
            ) : exportSuccess ? (
              <p className="text-sm font-semibold text-emerald-800">{exportSuccess}</p>
            ) : null}
            {asset.lastWepublishExportedAt ? (
              <p className="text-xs text-[var(--muted)]">
                {damWepublishExportedHint(asset.lastWepublishExportedAt)}
              </p>
            ) : null}

            <div>
              <p className="text-xs font-semibold text-[var(--muted)]">Collections</p>
              {asset.collections.length === 0 ? (
                <p className="mt-0.5 text-sm text-[var(--muted)]">Keine</p>
              ) : (
                <div className="mt-1 flex flex-wrap gap-1">
                  {asset.collections.map((collection) => (
                    <span
                      key={collection.id}
                      className="inline-flex max-w-full items-center gap-0.5 rounded-full bg-[var(--accent-soft)] py-0.5 pl-2 pr-0.5 text-xs font-semibold"
                    >
                      <Link
                        href={archiveCollectionHref(collection.id)}
                        className="min-w-0 truncate hover:underline"
                      >
                        {collection.name}
                      </Link>
                      <button
                        type="button"
                        className="rounded-full p-0.5 hover:bg-white/70"
                        aria-label={`${collection.name} entfernen`}
                        onClick={() =>
                          onSetCollections(
                            asset.id,
                            asset.collections
                              .filter((item) => item.id !== collection.id)
                              .map((item) => item.id),
                          )
                        }
                      >
                        <X className="size-2.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="mt-2">
                <DamCombobox
                  id={`archive-add-collection-${asset.id}`}
                  label="Zu Collection hinzufügen"
                  emptyLabel="Collection suchen…"
                  placeholder="Collection suchen oder anlegen…"
                  options={allCollections
                    .filter(
                      (collection) =>
                        !asset.collections.some((item) => item.id === collection.id),
                    )
                    .map((collection) => ({
                      value: collection.id,
                      label: collection.name,
                    }))}
                  value={[]}
                  remote={collectionsRemote}
                  onSearch={
                    collectionsRemote
                      ? async (q) => {
                          const params = new URLSearchParams({
                            type: "collections",
                            q,
                          });
                          const res = await fetch(`/api/dam/archive/facets?${params}`);
                          if (!res.ok) return [];
                          const data = (await res.json()) as {
                            options?: { value: string; label: string }[];
                          };
                          return (data.options ?? []).filter(
                            (option) =>
                              !asset.collections.some((item) => item.id === option.value),
                          );
                        }
                      : undefined
                  }
                  onCreate={onCreateCollection}
                  onChange={(ids) => {
                    const collectionId = ids[0];
                    if (!collectionId) return;
                    if (asset.collections.some((item) => item.id === collectionId)) {
                      return;
                    }
                    onSetCollections(asset.id, [
                      ...asset.collections.map((item) => item.id),
                      collectionId,
                    ]);
                  }}
                />
              </div>
            </div>

            <DamMetaRow
              label="Kontext"
              display={asset.notes ?? ""}
              field="notes"
              editing={editing}
              onEdit={startEdit}
            >
              <DamEditControl onSave={() => saveField("notes")}>
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
              </DamEditControl>
            </DamMetaRow>

            <DamMetaRow
              label="Alt-Text"
              display={asset.altText ?? ""}
              field="altText"
              editing={editing}
              onEdit={startEdit}
            >
              <DamEditControl onSave={() => saveField("altText")}>
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={onDraftKey}
                  onBlur={onDraftBlur}
                  rows={3}
                  autoFocus
                  aria-label="Alt-Text"
                />
              </DamEditControl>
            </DamMetaRow>

            <DamMetaRow
              label="Keywords"
              display={asset.keywords.join(", ")}
              displayNode={
                <DamKeywordPills
                  keywords={asset.keywords}
                  onRemove={(keyword) =>
                    onPatch(asset.id, {
                      keywords: asset.keywords.filter((item) => item !== keyword),
                    })
                  }
                />
              }
              field="keywords"
              editing={editing}
              onEdit={startEdit}
            >
              <DamEditControl onSave={() => saveField("keywords")}>
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={onDraftKey}
                  onBlur={onDraftBlur}
                  placeholder="zürich, velo, podium"
                  autoFocus
                  aria-label="Keywords"
                />
              </DamEditControl>
            </DamMetaRow>

            <DamMetaRow
              label="Credit"
              display={asset.credit}
              field="credit"
              editing={editing}
              onEdit={startEdit}
            >
              <DamEditControl onSave={() => saveField("credit")}>
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={onDraftKey}
                  onBlur={onDraftBlur}
                  autoFocus
                  aria-label="Credit"
                />
              </DamEditControl>
            </DamMetaRow>

            <DamMetaRow
              label="Rechte"
              display={damRightsLabel(asset.rightsType)}
              field="rightsType"
              editing={editing}
              onEdit={startEdit}
            >
              <DamEditControl onSave={() => saveField("rightsType")}>
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
              </DamEditControl>
            </DamMetaRow>

            {asset.width && asset.height ? (
              <div>
                <p className="text-xs font-semibold text-[var(--muted)]">Masse</p>
                <p className="mt-0.5 text-sm">
                  {asset.width} × {asset.height}
                </p>
              </div>
            ) : null}

            <DamMetaRow
              label="Aufnahmedatum"
              display={formatTakenAt(asset.takenAt)}
              field="takenAt"
              editing={editing}
              onEdit={startEdit}
            >
              <DamEditControl onSave={() => saveField("takenAt")}>
                <input
                  type="datetime-local"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={onDraftKey}
                  onBlur={onDraftBlur}
                  autoFocus
                  aria-label="Aufgenommen"
                />
              </DamEditControl>
            </DamMetaRow>

            {asset.publishedAt ? (
              <div>
                <p className="text-xs font-semibold text-[var(--muted)]">Publiziert</p>
                <p className="mt-0.5 text-sm">
                  {new Date(asset.publishedAt).toLocaleString("de-CH")}
                </p>
              </div>
            ) : null}

            <p className="text-xs text-[var(--muted)]">
              Stift zum Bearbeiten, Enter speichert, Esc bricht ab. ← → blättern,
              E Bildeditor.
            </p>
          </div>

          {onTrash ? (
            <div className="shrink-0 border-t border-[var(--border)] px-4 py-2.5">
              <button
                type="button"
                className="flex w-full items-center justify-center gap-1.5 py-1 text-xs font-semibold text-[var(--muted)] transition hover:text-[var(--danger)]"
                onClick={() => onTrash(asset.id)}
              >
                <Trash2 className="size-3.5" aria-hidden />
                In den Papierkorb
              </button>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
