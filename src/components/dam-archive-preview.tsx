"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Trash2, X } from "lucide-react";
import { DamRatingStars } from "@/components/dam-rating-stars";
import { downloadPublishedAssets } from "@/lib/dam/browser-download";
import { damRightsLabel } from "@/lib/dam/types";
import type { ArchiveAssetCard } from "@/lib/dam/types";

function formatTakenAt(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("de-CH");
}

function MetaBlock({ label, children }: { label: string; children: string }) {
  return (
    <div>
      <p className="text-xs font-semibold text-[var(--muted)]">{label}</p>
      <p className="mt-0.5 text-sm whitespace-pre-wrap">{children || "—"}</p>
    </div>
  );
}

export function DamArchivePreview({
  assets,
  index,
  onIndexChange,
  onClose,
  onTrash,
}: {
  assets: ArchiveAssetCard[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  onTrash?: (assetId: string) => void;
}) {
  const asset = assets[index];
  const count = assets.length;
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [seenId, setSeenId] = useState(asset?.id);
  if (asset?.id !== seenId) {
    setSeenId(asset?.id);
    setDownloadError(null);
    setDownloading(false);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
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
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [count, index, onClose, onIndexChange]);

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
              src={`/api/dam/assets/${asset.id}/file?variant=original`}
              alt={asset.altText || asset.fileName}
              className="block max-h-[80vh] max-w-full object-contain"
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
          {count > 1 ? (
            <p className="px-4 py-3 text-sm text-white/70">
              {index + 1} / {count}
            </p>
          ) : null}
        </div>

        <aside className="flex w-full shrink-0 flex-col overflow-y-auto border-t border-[var(--border)] lg:w-[22rem] lg:border-t-0 lg:border-l">
          <div className="flex items-start justify-between gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold tracking-wide text-[var(--accent)] uppercase">
                Archiv
              </p>
              <h2
                id="dam-archive-preview-title"
                className="mt-1 break-all font-[family-name:var(--font-display)] text-base font-semibold"
              >
                {asset.fileName}
              </h2>
            </div>
            <button
              type="button"
              className="btn btn-ghost px-2"
              aria-label="Schliessen"
              onClick={onClose}
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="space-y-4 px-4 pb-5">
            <DamRatingStars rating={asset.rating} />

            <button
              type="button"
              className="btn btn-primary w-full"
              disabled={downloading}
              onClick={downloadOriginal}
            >
              <Download className="size-4" aria-hidden />
              {downloading ? "Wird vorbereitet…" : "Original herunterladen"}
            </button>
            {downloadError ? (
              <p className="text-sm text-red-600">{downloadError}</p>
            ) : (
              <p className="text-xs text-[var(--muted)]">
                Volle Auflösung, direkt von R2. Der Link gilt zwei Minuten.
              </p>
            )}

            {onTrash ? (
              <button
                type="button"
                className="btn btn-ghost w-full"
                onClick={() => onTrash(asset.id)}
              >
                <Trash2 className="size-4" aria-hidden />
                In den Papierkorb
              </button>
            ) : null}

            <MetaBlock label="Credit">{asset.credit}</MetaBlock>
            <MetaBlock label="Rechte">{damRightsLabel(asset.rightsType)}</MetaBlock>
            <MetaBlock label="Aufnahmedatum">{formatTakenAt(asset.takenAt)}</MetaBlock>
            <MetaBlock label="Keywords">{asset.keywords.join(", ")}</MetaBlock>
            <MetaBlock label="Alt-Text">{asset.altText ?? ""}</MetaBlock>

            <div>
              <p className="text-xs font-semibold text-[var(--muted)]">Collections</p>
              {asset.collections.length === 0 ? (
                <p className="mt-0.5 text-sm text-[var(--muted)]">Keine</p>
              ) : (
                <div className="mt-1 flex flex-wrap gap-1">
                  {asset.collections.map((c) => (
                    <span
                      key={c.id}
                      className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-xs font-semibold"
                    >
                      {c.name}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {asset.width && asset.height ? (
              <MetaBlock label="Masse">{`${asset.width} × ${asset.height}`}</MetaBlock>
            ) : null}

            {asset.publishedAt ? (
              <MetaBlock label="Publiziert">
                {new Date(asset.publishedAt).toLocaleString("de-CH")}
              </MetaBlock>
            ) : null}

            <p className="text-xs text-[var(--muted)]">
              Esc schliesst, ← → blättern.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
