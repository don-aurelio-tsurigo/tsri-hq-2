"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { X } from "lucide-react";
import {
  assignAssetsToCollection,
  publishAssets,
  rejectAssets,
  removeAssetsFromCollection,
  saveAssetEditParams,
  setAssetRating,
  updateAssetMetadata,
} from "@/lib/actions/dam";
import { DamAssetDetail } from "@/components/dam-asset-detail";
import { DamAssetEditor } from "@/components/dam-asset-editor";
import { DamPublishDialog } from "@/components/dam-publish-dialog";
import { DamRatingStars } from "@/components/dam-rating-stars";
import { cssPreviewStyle } from "@/lib/dam/edit-params";
import type { AssetMetadataPatch, PersonalAssetCard } from "@/lib/dam/types";

export type { PersonalAssetCard };

type CollectionOption = { id: string; name: string };

export function DamPersonalGrid({
  initialAssets,
  allCollections,
}: {
  initialAssets: PersonalAssetCard[];
  allCollections: CollectionOption[];
}) {
  const [assets, setAssets] = useState(initialAssets);
  const [filterId, setFilterId] = useState<string | "all">("all");
  const [focused, setFocused] = useState(0);
  const [anchor, setAnchor] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detailIndex, setDetailIndex] = useState<number | null>(null);
  const [editorId, setEditorId] = useState<string | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assignId, setAssignId] = useState("");
  const [newCollection, setNewCollection] = useState("");
  const [pending, startTransition] = useTransition();

  const collectionsInUse = useMemo(() => {
    const map = new Map<string, string>();
    for (const asset of assets) {
      for (const c of asset.collections) map.set(c.id, c.name);
    }
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [assets]);

  const visible = useMemo(() => {
    if (filterId === "all") return assets;
    return assets.filter((a) => a.collections.some((c) => c.id === filterId));
  }, [assets, filterId]);

  const focusedAsset = visible[Math.min(focused, Math.max(0, visible.length - 1))];
  const overlayOpen = detailIndex !== null || editorId !== null || publishOpen;
  const ratedVisible = visible.filter((a) => (a.rating ?? 0) >= 3);
  const editorAsset = editorId
    ? assets.find((a) => a.id === editorId) ?? null
    : null;

  function openDetail(index: number) {
    setFocused(index);
    setAnchor(index);
    setDetailIndex(index);
  }

  function moveFocus(delta: number) {
    if (visible.length === 0) return;
    setFocused((prev) => {
      const next = (prev + delta + visible.length) % visible.length;
      setAnchor(next);
      return next;
    });
  }

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
    setSelected(new Set(visible.slice(start, end + 1).map((a) => a.id)));
    setFocused(toIndex);
  }

  function applyRating(assetId: string, rating: number) {
    setError(null);
    setAssets((prev) =>
      prev.map((a) => (a.id === assetId ? { ...a, rating } : a)),
    );
    startTransition(async () => {
      const result = await setAssetRating(assetId, rating);
      if (result.error) setError(result.error);
    });
  }

  function patchAsset(assetId: string, patch: AssetMetadataPatch) {
    setError(null);
    setAssets((prev) =>
      prev.map((a) => (a.id === assetId ? { ...a, ...patch } : a)),
    );
    startTransition(async () => {
      const result = await updateAssetMetadata(assetId, patch);
      if (result.error) setError(result.error);
    });
  }

  function rejectIds(ids: string[]) {
    if (ids.length === 0) return;
    setError(null);
    setAssets((prev) => prev.filter((a) => !ids.includes(a.id)));
    setSelected((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
    setDetailIndex(null);
    setEditorId(null);
    startTransition(async () => {
      const result = await rejectAssets(ids);
      if (result.error) setError(result.error);
    });
  }

  function removeFromCollection(ids: string[], collectionId: string) {
    if (ids.length === 0 || !collectionId) return;
    setError(null);
    setAssets((prev) =>
      prev.map((a) =>
        ids.includes(a.id)
          ? { ...a, collections: a.collections.filter((c) => c.id !== collectionId) }
          : a,
      ),
    );
    startTransition(async () => {
      const result = await removeAssetsFromCollection({
        assetIds: ids,
        collectionId,
      });
      if (result.error) setError(result.error);
    });
  }

  useEffect(() => {
    if (overlayOpen) return;

    function isTypingTarget(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      if (tag === "TEXTAREA") return true;
      if (tag === "SELECT") return true;
      if (tag === "INPUT") {
        const type = (target as HTMLInputElement).type;
        return type !== "checkbox" && type !== "radio";
      }
      return target.isContentEditable;
    }

    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      if (visible.length === 0) return;

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        moveFocus(-1);
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        moveFocus(1);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const currentIndex = Math.min(focused, visible.length - 1);
        if (visible[currentIndex]) openDetail(currentIndex);
        return;
      }
      if (e.key === "x" || e.key === "X") {
        e.preventDefault();
        const current = visible[Math.min(focused, visible.length - 1)];
        if (current) rejectIds([current.id]);
        return;
      }
      if (e.key >= "1" && e.key <= "5") {
        e.preventDefault();
        const current = visible[Math.min(focused, visible.length - 1)];
        if (current) applyRating(current.id, Number(e.key));
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focused, overlayOpen, visible]);

  useEffect(() => {
    const node = document.querySelector(`[data-dam-index="${focused}"]`);
    node?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [focused]);

  useEffect(() => {
    if (detailIndex === null) return;
    if (visible.length === 0) {
      setDetailIndex(null);
      return;
    }
    if (detailIndex >= visible.length) setDetailIndex(visible.length - 1);
  }, [detailIndex, visible.length]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={filterId === "all" ? "btn btn-primary" : "btn btn-ghost"}
          onClick={() => {
            setFilterId("all");
            setFocused(0);
            setAnchor(0);
          }}
        >
          Alle ({assets.length})
        </button>
        {collectionsInUse.map((c) => (
          <button
            key={c.id}
            type="button"
            className={filterId === c.id ? "btn btn-primary" : "btn btn-ghost"}
            onClick={() => {
              setFilterId(c.id);
              setFocused(0);
              setAnchor(0);
            }}
          >
            {c.name}
          </button>
        ))}
      </div>

      <p className="text-xs text-[var(--muted)]">
        Tastatur: ← → navigieren, 1–5 Rating, Enter oder Doppelklick für Details, X
        verwerfen. Shift-Klick wählt mehrere.
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-ghost"
          disabled={ratedVisible.length === 0}
          onClick={() =>
            setSelected(new Set(ratedVisible.map((asset) => asset.id)))
          }
        >
          Rating ≥ 3 wählen ({ratedVisible.length})
        </button>
      </div>

      {error ? (
        <p className="text-sm text-[var(--danger)]" role="alert">
          {error}
        </p>
      ) : null}

      {selected.size > 0 ? (
        <div className="card flex flex-wrap items-end gap-3 p-4">
          <p className="text-sm font-semibold">{selected.size} gewählt</p>
          <div className="field min-w-[12rem] flex-1">
            <label htmlFor="bulk-collection">Collection</label>
            <select
              id="bulk-collection"
              value={assignId}
              onChange={(e) => setAssignId(e.target.value)}
            >
              <option value="">— wählen —</option>
              {allCollections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field min-w-[10rem] flex-1">
            <label htmlFor="bulk-new">Oder neu</label>
            <input
              id="bulk-new"
              value={newCollection}
              onChange={(e) => setNewCollection(e.target.value)}
              placeholder="Name"
            />
          </div>
          <button
            type="button"
            className="btn btn-accent"
            disabled={pending || (!assignId && !newCollection.trim())}
            onClick={() => {
              const ids = [...selected];
              startTransition(async () => {
                const result = await assignAssetsToCollection({
                  assetIds: ids,
                  collectionId: assignId || undefined,
                  newName: newCollection.trim() || undefined,
                });
                if (result.error) {
                  setError(result.error);
                  return;
                }
                const name =
                  newCollection.trim() ||
                  allCollections.find((c) => c.id === assignId)?.name ||
                  "Collection";
                const collectionId = result.collectionId ?? assignId;
                setAssets((prev) =>
                  prev.map((a) =>
                    ids.includes(a.id) &&
                    !a.collections.some((c) => c.id === collectionId)
                      ? {
                          ...a,
                          collections: [...a.collections, { id: collectionId, name }],
                        }
                      : a,
                  ),
                );
                setNewCollection("");
              });
            }}
          >
            Zuweisen
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={pending || (!assignId && filterId === "all")}
            onClick={() => {
              const collectionId = assignId || (filterId === "all" ? "" : filterId);
              removeFromCollection([...selected], collectionId);
            }}
          >
            Aus Collection entfernen
          </button>
          <button
            type="button"
            className="btn btn-highlight"
            disabled={pending}
            onClick={() => {
              setDetailIndex(null);
              setEditorId(null);
              setPublishOpen(true);
            }}
          >
            Ins Archiv verschieben
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={pending}
            onClick={() => rejectIds([...selected])}
          >
            Verwerfen
          </button>
        </div>
      ) : null}

      {visible.length === 0 ? (
        <p className="card p-8 text-center text-[var(--muted)]">
          Keine Staging-Bilder in dieser Ansicht.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {visible.map((asset, index) => {
            const isFocused = focusedAsset?.id === asset.id;
            const isSelected = selected.has(asset.id);
            return (
              <li key={asset.id} data-dam-index={index}>
                <article
                  className={[
                    "card overflow-hidden",
                    isFocused ? "ring-2 ring-[var(--fg)]" : "",
                    isSelected ? "border-[var(--accent)]" : "",
                  ].join(" ")}
                  onClick={(e) => {
                    if (e.shiftKey) selectRange(index);
                    else {
                      setFocused(index);
                      setAnchor(index);
                    }
                  }}
                  onDoubleClick={() => openDetail(index)}
                >
                  <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden bg-[var(--panel-muted)] p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/dam/assets/${asset.id}/file?variant=thumb`}
                      alt=""
                      className="max-h-full max-w-full object-contain"
                      style={cssPreviewStyle(asset.editParams, asset)}
                    />
                    <label
                      className="absolute top-1 left-1 rounded bg-white/90 px-1 py-0.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelected(asset.id)}
                        aria-label={`${asset.fileName} auswählen`}
                      />
                    </label>
                  </div>
                  <div className="space-y-1 p-1.5">
                    <div className="flex gap-0.5" onClick={(e) => e.stopPropagation()}>
                      <DamRatingStars
                        rating={asset.rating}
                        onRate={(n) => applyRating(asset.id, n)}
                      />
                    </div>
                    <p className="truncate text-[0.65rem] font-semibold">{asset.credit}</p>
                    <div className="flex flex-wrap gap-0.5">
                      {asset.collections.map((c) => (
                        <span
                          key={c.id}
                          className="inline-flex items-center gap-0.5 rounded-full bg-[var(--accent-soft)] py-0 pl-1.5 pr-0.5 text-[0.6rem] font-semibold"
                        >
                          {c.name}
                          <button
                            type="button"
                            className="rounded-full p-0.5 hover:bg-white/70"
                            aria-label={`${c.name} entfernen`}
                            onClick={(e) => {
                              e.stopPropagation();
                              removeFromCollection([asset.id], c.id);
                            }}
                          >
                            <X className="size-2.5" />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}

      {detailIndex !== null && visible[detailIndex] ? (
        <DamAssetDetail
          assets={visible}
          index={detailIndex}
          onIndexChange={(next) => {
            setDetailIndex(next);
            setFocused(next);
            setAnchor(next);
          }}
          onClose={() => setDetailIndex(null)}
          onRate={applyRating}
          onPatch={patchAsset}
          onEdit={() => setEditorId(visible[detailIndex].id)}
          onRemoveFromCollection={(assetId, collectionId) =>
            removeFromCollection([assetId], collectionId)
          }
          keyboardEnabled={!editorAsset}
        />
      ) : null}

      {editorAsset ? (
        <DamAssetEditor
          fileName={editorAsset.fileName}
          imageSrc={`/api/dam/assets/${editorAsset.id}/file?variant=web`}
          initial={editorAsset.editParams}
          pending={pending}
          onClose={() => setEditorId(null)}
          onSave={(params) => {
            setAssets((prev) =>
              prev.map((a) =>
                a.id === editorAsset.id ? { ...a, editParams: params } : a,
              ),
            );
            startTransition(async () => {
              const result = await saveAssetEditParams(editorAsset.id, params);
              if (result.error) setError(result.error);
              else setEditorId(null);
            });
          }}
        />
      ) : null}

      {publishOpen ? (
        <DamPublishDialog
          assets={assets.filter((asset) => selected.has(asset.id))}
          pending={pending}
          onClose={() => setPublishOpen(false)}
          onConfirm={(items) => {
            startTransition(async () => {
              const result = await publishAssets(items);
              if (result.error && !result.publishedIds?.length) {
                setError(result.error);
                return;
              }
              const done = new Set(result.publishedIds ?? []);
              setAssets((prev) => prev.filter((asset) => !done.has(asset.id)));
              setSelected((prev) => {
                const next = new Set(prev);
                done.forEach((id) => next.delete(id));
                return next;
              });
              setPublishOpen(false);
              setDetailIndex(null);
              setEditorId(null);
              if (result.errors?.length) {
                setError(
                  `${done.size} verschoben, ${result.errors.length} fehlgeschlagen.`,
                );
              }
            });
          }}
        />
      ) : null}
    </div>
  );
}
