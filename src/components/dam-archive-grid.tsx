"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, Pencil, Send, Trash2, X } from "lucide-react";
import { DamArchiveBulkEditDialog } from "@/components/dam-archive-bulk-edit";
import { DamArchivePreview } from "@/components/dam-archive-preview";
import { DamAssetEditor } from "@/components/dam-asset-editor";
import { DamConfirmDialog } from "@/components/dam-confirm-dialog";
import { DamRatingStars } from "@/components/dam-rating-stars";
import { useToast } from "@/components/toast";
import {
  assignAssetsToCollection,
  createDamCollection,
  moveAssetsToTrash,
  removeAssetsFromCollection,
  saveAssetEditParams,
  updateAssetMetadata,
} from "@/lib/actions/dam";
import type { ArchiveFacets } from "@/lib/dam/archive-search";
import { downloadPublishedAssets } from "@/lib/dam/browser-download";
import { damFileSrc } from "@/lib/dam/edit-params";
import { MAX_ARCHIVE_DOWNLOADS } from "@/lib/dam/download-constants";
import {
  damRightsLabel,
  damWepublishExportedHint,
  type ArchiveAssetCard,
  type AssetMetadataPatch,
} from "@/lib/dam/types";

export function DamArchiveGrid({
  assets,
  facets,
}: {
  assets: ArchiveAssetCard[];
  facets: ArchiveFacets;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  const [focused, setFocused] = useState(0);
  const [anchor, setAnchor] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [editorId, setEditorId] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trashIds, setTrashIds] = useState<string[] | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [exportedAt, setExportedAt] = useState<Record<string, string>>({});
  const [exporting, setExporting] = useState(false);
  const [overrides, setOverrides] = useState<
    Record<string, Partial<ArchiveAssetCard>>
  >({});
  const [extraCollections, setExtraCollections] = useState<
    { id: string; name: string }[]
  >([]);
  const extraCollectionsRef = useRef(extraCollections);
  extraCollectionsRef.current = extraCollections;
  const assetKey = assets.map((asset) => asset.id).join(",");
  const [seenAssets, setSeenAssets] = useState(assetKey);
  if (assetKey !== seenAssets) {
    setSeenAssets(assetKey);
    setSelected(new Set());
    setFocused(0);
    setAnchor(0);
    setPreviewIndex(null);
    setEditorId(null);
    setBulkOpen(false);
    setError(null);
    setProgress(null);
    setExporting(false);
    setOverrides({});
  }

  const viewAssets = assets.map((asset) => ({
    ...asset,
    ...overrides[asset.id],
    lastWepublishExportedAt:
      exportedAt[asset.id] ??
      overrides[asset.id]?.lastWepublishExportedAt ??
      asset.lastWepublishExportedAt,
  }));

  const allCollections = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    for (const collection of facets.collections) map.set(collection.id, collection);
    for (const asset of viewAssets) {
      for (const collection of asset.collections) map.set(collection.id, collection);
    }
    for (const collection of extraCollections) map.set(collection.id, collection);
    return [...map.values()];
  }, [extraCollections, facets.collections, viewAssets]);

  function patchAsset(assetId: string, patch: AssetMetadataPatch) {
    setError(null);
    setOverrides((prev) => ({
      ...prev,
      [assetId]: { ...prev[assetId], ...patch },
    }));
    startTransition(async () => {
      const result = await updateAssetMetadata(assetId, patch);
      if (result.error) setError(result.error);
    });
  }

  function setAssetCollections(assetId: string, nextIds: string[]) {
    const asset = viewAssets.find((item) => item.id === assetId);
    if (!asset) return;
    const prevIds = asset.collections.map((collection) => collection.id);
    const toAdd = nextIds.filter((id) => !prevIds.includes(id));
    const toRemove = prevIds.filter((id) => !nextIds.includes(id));
    const nextCollections = nextIds.map((id) => {
      const known =
        allCollections.find((collection) => collection.id === id) ??
        extraCollectionsRef.current.find((collection) => collection.id === id) ??
        asset.collections.find((collection) => collection.id === id);
      return known ?? { id, name: "Collection" };
    });
    setError(null);
    setOverrides((prev) => ({
      ...prev,
      [assetId]: { ...prev[assetId], collections: nextCollections },
    }));
    for (const collectionId of toAdd) {
      startTransition(async () => {
        const result = await assignAssetsToCollection({
          assetIds: [assetId],
          collectionId,
        });
        if (result.error) setError(result.error);
      });
    }
    for (const collectionId of toRemove) {
      startTransition(async () => {
        const result = await removeAssetsFromCollection({
          assetIds: [assetId],
          collectionId,
        });
        if (result.error) setError(result.error);
      });
    }
  }

  async function createCollection(name: string) {
    const result = await createDamCollection(name, { isPersonal: false });
    if (result.error || !result.collection) {
      setError(result.error ?? "Collection konnte nicht angelegt werden.");
      return null;
    }
    const collection = result.collection;
    extraCollectionsRef.current = extraCollectionsRef.current.some(
      (item) => item.id === collection.id,
    )
      ? extraCollectionsRef.current
      : [...extraCollectionsRef.current, collection];
    setExtraCollections(extraCollectionsRef.current);
    return { value: collection.id, label: collection.name };
  }

  useEffect(() => {
    if (previewIndex !== null || bulkOpen || trashIds || editorId) return;

    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = e.target instanceof HTMLElement ? e.target.tagName : "";
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      if (viewAssets.length === 0) return;
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const delta = e.key === "ArrowRight" ? 1 : -1;
        setFocused((prev) => {
          const next = (prev + delta + viewAssets.length) % viewAssets.length;
          setAnchor(next);
          return next;
        });
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        setPreviewIndex(Math.min(focused, viewAssets.length - 1));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [bulkOpen, editorId, focused, previewIndex, trashIds, viewAssets.length]);

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectRange(toIndex: number) {
    const start = Math.min(anchor, toIndex);
    const end = Math.max(anchor, toIndex);
    setSelected(new Set(viewAssets.slice(start, end + 1).map((asset) => asset.id)));
    setFocused(toIndex);
  }

  async function downloadSelected() {
    const ids = viewAssets.filter((asset) => selected.has(asset.id)).map((asset) => asset.id);
    if (ids.length === 0 || downloading) return;
    if (ids.length > MAX_ARCHIVE_DOWNLOADS) {
      setError(`Maximal ${MAX_ARCHIVE_DOWNLOADS} Bilder pro Download.`);
      return;
    }
    setError(null);
    setDownloading(true);
    setProgress(ids.length > 1 ? `0 / ${ids.length}` : null);
    try {
      await downloadPublishedAssets(ids, (done, total) => {
        setProgress(total > 1 ? `${done} / ${total}` : null);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download fehlgeschlagen.");
    } finally {
      setDownloading(false);
      setProgress(null);
    }
  }

  const overLimit = selected.size > MAX_ARCHIVE_DOWNLOADS;
  const overlayOpen =
    previewIndex !== null || trashIds !== null || bulkOpen || editorId !== null;
  const editorAsset = editorId
    ? (viewAssets.find((asset) => asset.id === editorId) ?? null)
    : null;
  const busy = downloading || exporting || pending;

  async function sendSelectedToWepublish() {
    const ids = viewAssets.filter((asset) => selected.has(asset.id)).map((asset) => asset.id);
    if (ids.length === 0 || exporting) return;
    setError(null);
    setExporting(true);
    setProgress(ids.length > 1 ? `0 / ${ids.length}` : null);
    let ok = 0;
    let failed = 0;
    try {
      for (const [index, id] of ids.entries()) {
        if (ids.length > 1) setProgress(`${index + 1} / ${ids.length}`);
        const res = await fetch("/api/dam/export-wepublish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assetId: id }),
        });
        const data = (await res.json()) as { error?: string; exportedAt?: string };
        if (!res.ok || !data.exportedAt) {
          failed += 1;
          continue;
        }
        ok += 1;
        setExportedAt((prev) => ({ ...prev, [id]: data.exportedAt as string }));
      }
      if (failed > 0 && ok === 0) {
        setError("Senden an WePublish fehlgeschlagen.");
      } else if (failed > 0) {
        setError(`${ok} gesendet, ${failed} fehlgeschlagen.`);
      } else {
        showToast({
          message:
            ok === 1
              ? "Bild an WePublish gesendet."
              : `${ok} Bilder an WePublish gesendet.`,
        });
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Senden an WePublish fehlgeschlagen.",
      );
    } finally {
      setExporting(false);
      setProgress(null);
    }
  }

  function confirmTrash(ids: string[]) {
    if (ids.length === 0) return;
    setError(null);
    setTrashIds(ids);
  }

  function runTrash() {
    if (!trashIds?.length || pending) return;
    const ids = trashIds;
    startTransition(async () => {
      const result = await moveAssetsToTrash(ids);
      if (result.error) {
        setError(result.error);
        return;
      }
      setTrashIds(null);
      setPreviewIndex(null);
      setSelected(new Set());
      router.refresh();
    });
  }

  return (
    <div className={selected.size > 0 && !overlayOpen ? "space-y-3 pb-24" : "space-y-3"}>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => setSelected(new Set(assets.map((asset) => asset.id)))}
        >
          Alle wählen ({assets.length})
        </button>
      </div>

      {error ? (
        <p className="text-sm text-[var(--danger)]" role="alert">
          {error}
        </p>
      ) : null}

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {viewAssets.map((asset, index) => {
          const isFocused = focused === index;
          const isSelected = selected.has(asset.id);
          return (
            <li key={asset.id} data-dam-index={index}>
              <article
                className={[
                  "card cursor-pointer overflow-hidden",
                  isFocused ? "ring-2 ring-[var(--fg)]" : "",
                  isSelected ? "border-[var(--accent)]" : "",
                ].join(" ")}
                tabIndex={0}
                onClick={(e) => {
                  if (e.shiftKey) selectRange(index);
                  else {
                    setFocused(index);
                    setAnchor(index);
                  }
                }}
                onDoubleClick={() => setPreviewIndex(index)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    setFocused(index);
                    setPreviewIndex(index);
                  }
                }}
              >
                <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden bg-[var(--panel-muted)] p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={damFileSrc(asset.id, "thumb", asset.editParams)}
                    alt={asset.altText || asset.fileName}
                    loading="lazy"
                    decoding="async"
                    className="max-h-full max-w-full object-contain"
                  />
                  <label
                    className="absolute top-1 left-1 rounded bg-white/90 px-1 py-0.5"
                    onClick={(e) => e.stopPropagation()}
                    onDoubleClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {
                        setFocused(index);
                        setAnchor(index);
                        toggleSelected(asset.id);
                      }}
                      aria-label={`${asset.fileName} auswählen`}
                    />
                  </label>
                </div>
                <div className="space-y-1 p-2">
                  <DamRatingStars rating={asset.rating} />
                  <p className="truncate text-sm font-semibold">{asset.fileName}</p>
                  <p className="truncate text-xs text-[var(--muted)]">{asset.credit}</p>
                  <p className="text-[0.65rem] text-[var(--muted)]">
                    {damRightsLabel(asset.rightsType)}
                    {asset.takenAt
                      ? ` · ${new Date(asset.takenAt).toLocaleDateString("de-CH")}`
                      : ""}
                  </p>
                  {(exportedAt[asset.id] ?? asset.lastWepublishExportedAt) ? (
                    <p className="text-[0.65rem] text-[var(--muted)]">
                      {damWepublishExportedHint(
                        exportedAt[asset.id] ?? asset.lastWepublishExportedAt ?? "",
                      )}
                    </p>
                  ) : null}
                  {asset.collections.length > 0 ? (
                    <div className="flex flex-wrap gap-0.5">
                      {asset.collections.map((collection) => (
                        <span
                          key={collection.id}
                          className="max-w-full truncate rounded-full bg-[var(--accent-soft)] px-1.5 py-0.5 text-[0.6rem] font-semibold"
                        >
                          {collection.name}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </article>
            </li>
          );
        })}
      </ul>

      {selected.size > 0 && !overlayOpen ? (
        <div className="fixed inset-x-3 bottom-3 z-30 md:left-[calc(16rem+1.25rem)] md:right-6">
          <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-2 rounded-full border-2 border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 shadow-[var(--shadow)]">
            <p className="px-2 text-sm font-semibold">{selected.size} gewählt</p>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy}
              onClick={() => {
                setError(null);
                setBulkOpen(true);
              }}
            >
              <Pencil className="size-4" aria-hidden />
              Metadaten
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy || overLimit}
              onClick={() => void downloadSelected()}
            >
              <Download className="size-4" aria-hidden />
              {downloading
                ? progress
                  ? `Lädt ${progress}…`
                  : "Wird vorbereitet…"
                : "Herunterladen"}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy}
              onClick={() => confirmTrash([...selected])}
            >
              <Trash2 className="size-4" aria-hidden />
              In den Papierkorb
            </button>
            <button
              type="button"
              className="btn btn-highlight"
              disabled={busy}
              onClick={() => void sendSelectedToWepublish()}
            >
              <Send className="size-4" aria-hidden />
              {exporting
                ? progress
                  ? `Sendet ${progress}…`
                  : "Sendet…"
                : "Zu WePublish schicken"}
            </button>
            {overLimit ? (
              <p className="text-xs text-[var(--muted)]">
                Maximal {MAX_ARCHIVE_DOWNLOADS} Bilder pro Download.
              </p>
            ) : null}
            <button
              type="button"
              className="btn btn-ghost ml-auto px-2"
              aria-label="Auswahl aufheben"
              disabled={busy}
              onClick={() => setSelected(new Set())}
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      ) : null}

      {previewIndex !== null ? (
        <DamArchivePreview
          assets={viewAssets}
          index={previewIndex}
          allCollections={allCollections}
          onIndexChange={setPreviewIndex}
          onClose={() => setPreviewIndex(null)}
          onTrash={(id) => confirmTrash([id])}
          onWepublishExported={(assetId, at) =>
            setExportedAt((prev) => ({ ...prev, [assetId]: at }))
          }
          onPatch={patchAsset}
          onSetCollections={setAssetCollections}
          onCreateCollection={createCollection}
          collectionsRemote={facets.collectionsTruncated}
          keyboardEnabled={!editorAsset}
          onEdit={() => {
            const asset = viewAssets[previewIndex];
            if (asset) setEditorId(asset.id);
          }}
        />
      ) : null}

      {editorAsset ? (
        <DamAssetEditor
          fileName={editorAsset.fileName}
          imageSrc={damFileSrc(editorAsset.id, "original")}
          initial={editorAsset.editParams}
          pending={pending}
          onClose={() => setEditorId(null)}
          onSave={(params) => {
            startTransition(async () => {
              const result = await saveAssetEditParams(editorAsset.id, params);
              if (result.error) {
                setError(result.error);
                return;
              }
              setOverrides((prev) => ({
                ...prev,
                [editorAsset.id]: { ...prev[editorAsset.id], editParams: params },
              }));
              setEditorId(null);
            });
          }}
        />
      ) : null}

      {bulkOpen ? (
        <DamArchiveBulkEditDialog
          assets={assets}
          selectedIds={[...selected]}
          facets={facets}
          pending={pending}
          onClose={() => setBulkOpen(false)}
          onSaved={(count) => {
            setBulkOpen(false);
            setOverrides({});
            showToast({
              message:
                count === 1
                  ? "1 Bild aktualisiert."
                  : `${count} Bilder aktualisiert.`,
            });
            router.refresh();
          }}
        />
      ) : null}

      {trashIds ? (
        <DamConfirmDialog
          title="In den Papierkorb?"
          body={
            trashIds.length === 1
              ? "Bild in den Papierkorb verschieben? Wird nach 30 Tagen endgültig gelöscht."
              : `${trashIds.length} Bilder in den Papierkorb verschieben? Sie werden nach 30 Tagen endgültig gelöscht.`
          }
          confirmLabel="In den Papierkorb"
          pending={pending}
          onClose={() => setTrashIds(null)}
          onConfirm={runTrash}
        />
      ) : null}
    </div>
  );
}
