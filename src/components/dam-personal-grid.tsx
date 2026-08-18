"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { MoreHorizontal, X } from "lucide-react";
import {
  assignAssetsToCollection,
  createDamCollection,
  publishAssets,
  rejectAssets,
  removeAssetsFromCollection,
  saveAssetEditParams,
  setAssetRating,
  updateAssetMetadata,
} from "@/lib/actions/dam";
import { DamAssetDetail } from "@/components/dam-asset-detail";
import { DamAssetEditor } from "@/components/dam-asset-editor";
import { DamCombobox } from "@/components/dam-combobox";
import { DamPublishDialog } from "@/components/dam-publish-dialog";
import { DamRatingStars } from "@/components/dam-rating-stars";
import { cssPreviewStyle } from "@/lib/dam/edit-params";
import {
  RATING_FILTERS,
  matchesRatingFilter,
  type RatingFilter,
} from "@/lib/dam/rating-filter";
import {
  damWepublishExportedHint,
  type AssetMetadataPatch,
  type PersonalAssetCard,
} from "@/lib/dam/types";

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
  const [collections, setCollections] = useState(allCollections);
  const [filterId, setFilterId] = useState<string | "all">("all");
  const [ratingFilter, setRatingFilter] = useState<RatingFilter>("all");
  const [focused, setFocused] = useState(0);
  const [anchor, setAnchor] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detailIndex, setDetailIndex] = useState<number | null>(null);
  const [editorId, setEditorId] = useState<string | null>(null);
  const [publishIds, setPublishIds] = useState<string[] | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const assignRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setAssets(initialAssets);
  }, [initialAssets]);

  useEffect(() => {
    if (!initialAssets.some((asset) => !asset.altText?.trim())) return;
    let ticks = 0;
    let cancelled = false;
    const id = window.setInterval(() => {
      ticks += 1;
      void (async () => {
        try {
          const res = await fetch("/api/dam/personal");
          if (!res.ok) return;
          const data = (await res.json()) as { assets?: typeof initialAssets };
          if (cancelled || !Array.isArray(data.assets)) return;
          setAssets(data.assets);
          const stillPending = data.assets.some((asset) => !asset.altText?.trim());
          if (!stillPending) window.clearInterval(id);
        } catch {
          /* keep current cards */
        }
      })();
      if (ticks >= 40) window.clearInterval(id);
    }, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [initialAssets]);

  const ratingMatched = useMemo(
    () => assets.filter((asset) => matchesRatingFilter(asset.rating, ratingFilter)),
    [assets, ratingFilter],
  );

  const collectionsInUse = useMemo(() => {
    const map = new Map<string, { name: string; count: number }>();
    for (const asset of ratingMatched) {
      for (const collection of asset.collections) {
        const prev = map.get(collection.id);
        map.set(collection.id, {
          name: collection.name,
          count: (prev?.count ?? 0) + 1,
        });
      }
    }
    return [...map.entries()].map(([id, item]) => ({ id, ...item }));
  }, [ratingMatched]);

  const visible = useMemo(() => {
    if (filterId === "all") return ratingMatched;
    return ratingMatched.filter((asset) =>
      asset.collections.some((collection) => collection.id === filterId),
    );
  }, [filterId, ratingMatched]);

  const focusedAsset = visible[Math.min(focused, Math.max(0, visible.length - 1))];
  const overlayOpen = detailIndex !== null || editorId !== null || publishIds !== null;
  const editorAsset = editorId
    ? assets.find((a) => a.id === editorId) ?? null
    : null;
  const publishAssetsForDialog = publishIds
    ? assets.filter((asset) => publishIds.includes(asset.id))
    : [];
  const collectionOptions = collections.map((collection) => ({
    value: collection.id,
    label: collection.name,
  }));

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
    setAssignOpen(false);
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
    setAssignOpen(false);
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
    setAssignOpen(false);
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

  function assignCollection(ids: string[], collectionId: string) {
    if (ids.length === 0 || !collectionId) return;
    const name =
      collections.find((collection) => collection.id === collectionId)?.name ??
      "Collection";
    setError(null);
    setAssets((prev) =>
      prev.map((asset) =>
        ids.includes(asset.id) &&
        !asset.collections.some((collection) => collection.id === collectionId)
          ? {
              ...asset,
              collections: [...asset.collections, { id: collectionId, name }],
            }
          : asset,
      ),
    );
    startTransition(async () => {
      const result = await assignAssetsToCollection({
        assetIds: ids,
        collectionId,
      });
      if (result.error) setError(result.error);
    });
  }

  function setAssetCollections(assetId: string, nextIds: string[]) {
    const asset = assets.find((item) => item.id === assetId);
    if (!asset) return;
    const prevIds = asset.collections.map((collection) => collection.id);
    const toAdd = nextIds.filter((id) => !prevIds.includes(id));
    const toRemove = prevIds.filter((id) => !nextIds.includes(id));
    for (const id of toAdd) assignCollection([assetId], id);
    for (const id of toRemove) removeFromCollection([assetId], id);
  }

  async function createCollection(name: string) {
    const result = await createDamCollection(name);
    if (result.error || !result.collection) {
      setError(result.error ?? "Collection konnte nicht angelegt werden.");
      return null;
    }
    const collection = result.collection;
    setCollections((prev) =>
      prev.some((item) => item.id === collection.id) ? prev : [...prev, collection],
    );
    return { value: collection.id, label: collection.name };
  }

  function openPublish(ids: string[]) {
    if (ids.length === 0) return;
    setDetailIndex(null);
    setEditorId(null);
    setAssignOpen(false);
    setPublishIds(ids);
  }

  useEffect(() => {
    if (!assignOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (!assignRef.current?.contains(event.target as Node)) {
        setAssignOpen(false);
      }
    }
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [assignOpen]);

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
    <div className={selected.size > 0 && !overlayOpen ? "space-y-5 pb-24" : "space-y-5"}>
      <div
        className="flex flex-wrap items-center gap-3"
        role="radiogroup"
        aria-label="Rating-Filter"
      >
        <div className="inline-flex flex-wrap rounded-full border-2 border-[var(--border)] bg-white p-0.5">
          {RATING_FILTERS.map((option) => {
            const active = ratingFilter === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={active}
                className={[
                  "rounded-full px-3 py-1.5 text-sm font-semibold",
                  active
                    ? "bg-[var(--fg)] text-white"
                    : "text-[var(--muted)] hover:text-[var(--fg)]",
                ].join(" ")}
                onClick={() => {
                  setRatingFilter(option.value);
                  setFocused(0);
                  setAnchor(0);
                }}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          className="btn btn-primary"
          disabled={visible.length === 0}
          onClick={() => {
            setAssignOpen(false);
            setSelected(new Set(visible.map((asset) => asset.id)));
          }}
        >
          Alle markieren ({visible.length})
        </button>
      </div>

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
          Alle ({ratingMatched.length})
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
            {c.name} ({c.count})
          </button>
        ))}
      </div>

      <p className="text-xs text-[var(--muted)]">
        Tastatur: ← → navigieren, 1–5 Rating, Enter oder Doppelklick für Details, X
        löschen. Shift-Klick wählt mehrere.
      </p>

      {error ? (
        <p className="text-sm text-[var(--danger)]" role="alert">
          {error}
        </p>
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
                    {asset.lastWepublishExportedAt ? (
                      <p className="text-[0.6rem] text-[var(--muted)]">
                        {damWepublishExportedHint(asset.lastWepublishExportedAt)}
                      </p>
                    ) : null}
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

      {selected.size > 0 && !overlayOpen ? (
        <div className="fixed inset-x-3 bottom-3 z-30 md:left-[calc(16rem+1.25rem)] md:right-6">
          <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-2 rounded-full border-2 border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 shadow-[var(--shadow)]">
            <p className="px-2 text-sm font-semibold">{selected.size} gewählt</p>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={pending}
              onClick={() => rejectIds([...selected])}
            >
              Löschen
            </button>
            <button
              type="button"
              className="btn btn-highlight"
              disabled={pending}
              onClick={() => openPublish([...selected])}
            >
              Ins Archiv verschieben
            </button>
            <div className="relative ml-auto" ref={assignRef}>
              {assignOpen ? (
                <div className="absolute right-0 bottom-full mb-2 w-[min(22rem,calc(100vw-2rem))] rounded-[var(--radius)] border-2 border-[var(--border)] bg-[var(--bg-elevated)] p-3 shadow-[var(--shadow)]">
                  <DamCombobox
                    id="selection-assign-collection"
                    label="Anderer Collection zuweisen"
                    emptyLabel="Collection suchen…"
                    placeholder="Collection suchen…"
                    options={collectionOptions}
                    value={[]}
                    placement="top"
                    onCreate={createCollection}
                    onChange={(ids) => {
                      const collectionId = ids[0];
                      if (!collectionId) return;
                      assignCollection([...selected], collectionId);
                      setAssignOpen(false);
                    }}
                  />
                </div>
              ) : null}
              <button
                type="button"
                className="btn btn-ghost px-3"
                aria-expanded={assignOpen}
                aria-haspopup="dialog"
                aria-label="Weitere Aktionen"
                onClick={() => setAssignOpen((open) => !open)}
              >
                <MoreHorizontal className="size-4" aria-hidden />
              </button>
            </div>
            <button
              type="button"
              className="btn btn-ghost px-2"
              aria-label="Auswahl aufheben"
              onClick={() => {
                setAssignOpen(false);
                setSelected(new Set());
              }}
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      ) : null}

      {detailIndex !== null && visible[detailIndex] ? (
        <DamAssetDetail
          assets={visible}
          index={detailIndex}
          allCollections={collections}
          onIndexChange={(next) => {
            setDetailIndex(next);
            setFocused(next);
            setAnchor(next);
          }}
          onClose={() => setDetailIndex(null)}
          onRate={applyRating}
          onPatch={patchAsset}
          onEdit={() => setEditorId(visible[detailIndex].id)}
          onSetCollections={setAssetCollections}
          onCreateCollection={createCollection}
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

      {publishIds && publishAssetsForDialog.length > 0 ? (
        <DamPublishDialog
          assets={publishAssetsForDialog}
          allCollections={collections}
          pending={pending}
          onClose={() => setPublishIds(null)}
          onCreateCollection={createCollection}
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
              setPublishIds(null);
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
