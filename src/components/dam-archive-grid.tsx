"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, Trash2 } from "lucide-react";
import { DamArchivePreview } from "@/components/dam-archive-preview";
import { DamConfirmDialog } from "@/components/dam-confirm-dialog";
import { DamRatingStars } from "@/components/dam-rating-stars";
import { moveAssetsToTrash } from "@/lib/actions/dam";
import { downloadPublishedAssets } from "@/lib/dam/browser-download";
import { MAX_ARCHIVE_DOWNLOADS } from "@/lib/dam/download-constants";
import { damRightsLabel } from "@/lib/dam/types";
import type { ArchiveAssetCard } from "@/lib/dam/types";

export function DamArchiveGrid({ assets }: { assets: ArchiveAssetCard[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [focused, setFocused] = useState(0);
  const [anchor, setAnchor] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trashIds, setTrashIds] = useState<string[] | null>(null);
  const assetKey = assets.map((asset) => asset.id).join(",");
  const [seenAssets, setSeenAssets] = useState(assetKey);
  if (assetKey !== seenAssets) {
    setSeenAssets(assetKey);
    setSelected(new Set());
    setFocused(0);
    setAnchor(0);
    setPreviewIndex(null);
    setError(null);
    setProgress(null);
  }

  useEffect(() => {
    if (previewIndex !== null) return;

    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = e.target instanceof HTMLElement ? e.target.tagName : "";
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      if (assets.length === 0) return;
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const delta = e.key === "ArrowRight" ? 1 : -1;
        setFocused((prev) => {
          const next = (prev + delta + assets.length) % assets.length;
          setAnchor(next);
          return next;
        });
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        setPreviewIndex(Math.min(focused, assets.length - 1));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [assets.length, focused, previewIndex]);

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
    setSelected(new Set(assets.slice(start, end + 1).map((asset) => asset.id)));
    setFocused(toIndex);
  }

  async function downloadSelected() {
    const ids = assets.filter((asset) => selected.has(asset.id)).map((asset) => asset.id);
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
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => setSelected(new Set(assets.map((asset) => asset.id)))}
        >
          Alle wählen ({assets.length})
        </button>
        {selected.size > 0 ? (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setSelected(new Set())}
          >
            Auswahl aufheben
          </button>
        ) : null}
      </div>

      {error ? (
        <p className="text-sm text-[var(--danger)]" role="alert">
          {error}
        </p>
      ) : null}

      {selected.size > 0 ? (
        <div className="card flex flex-wrap items-center gap-3 p-4">
          <p className="text-sm font-semibold">{selected.size} gewählt</p>
          <button
            type="button"
            className="btn btn-primary"
            disabled={downloading || overLimit}
            onClick={() => void downloadSelected()}
          >
            <Download className="size-4" aria-hidden />
            {downloading
              ? progress
                ? `Lädt ${progress}…`
                : "Wird vorbereitet…"
              : selected.size === 1
                ? "Herunterladen"
                : "Als ZIP herunterladen"}
          </button>
          {overLimit ? (
            <p className="text-sm text-[var(--muted)]">
              Maximal {MAX_ARCHIVE_DOWNLOADS} Bilder pro Download.
            </p>
          ) : selected.size > 1 ? (
            <p className="text-xs text-[var(--muted)]">
              Originale in voller Auflösung, als ZIP.
            </p>
          ) : null}
          <button
            type="button"
            className="btn btn-ghost"
            disabled={pending}
            onClick={() => confirmTrash([...selected])}
          >
            <Trash2 className="size-4" aria-hidden />
            In den Papierkorb
          </button>
        </div>
      ) : null}

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {assets.map((asset, index) => {
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
                <div className="relative flex aspect-[4/3] items-center justify-center bg-[var(--panel-muted)] p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/dam/assets/${asset.id}/file?variant=thumb`}
                    alt={asset.altText || asset.fileName}
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
                </div>
              </article>
            </li>
          );
        })}
      </ul>

      {previewIndex !== null ? (
        <DamArchivePreview
          assets={assets}
          index={previewIndex}
          onIndexChange={setPreviewIndex}
          onClose={() => setPreviewIndex(null)}
          onTrash={(id) => confirmTrash([id])}
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
