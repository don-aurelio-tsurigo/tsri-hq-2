"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, EyeOff, Maximize2, Pencil, RotateCcw, Trash2, UserRound, X } from "lucide-react";
import { DamCombobox } from "@/components/dam-combobox";
import { DamConfirmDialog } from "@/components/dam-confirm-dialog";
import {
  assignAssetFace,
  assignFaces,
  deleteDamPerson,
  ignoreFaces,
  rejectFaces,
  renameDamPerson,
  unignoreFaces,
  type BulkFaceResult,
} from "@/lib/actions/dam-faces";
import { archiveHref, EMPTY_ARCHIVE_FILTERS } from "@/lib/dam/archive-filters";
import { damEditorSrc } from "@/lib/dam/edit-params";
import type { FaceTile, PersonCard, PersonDetail } from "@/lib/dam/face-overview";

const NEW_PREFIX = "new:";

function cropSrc(faceId: string) {
  return `/api/dam/faces/${faceId}/crop`;
}

function thumbSrc(assetId: string) {
  return `/api/dam/assets/${assetId}/file?variant=thumb`;
}

/** Archive filtered to the person (name = keyword) with this photo's preview open. */
function photoHref(personName: string, photo: { assetId: string; status: string }) {
  if (photo.status !== "published") return "/dam/personal";
  const href = archiveHref({ ...EMPTY_ARCHIVE_FILTERS, keywords: [personName] });
  return `${href}&open=${encodeURIComponent(photo.assetId)}`;
}

/** Whole photo with the face marked — for faces not (yet) linked to a person. */
function DamFacePhotoDialog({
  face,
  title,
  actions,
  onClose,
}: {
  face: FaceTile;
  title: string;
  actions?: ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        className="flex max-h-full max-w-5xl flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative max-h-full self-center">
          {/* Unedited, orientation-baked image: face boxes refer to it. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={damEditorSrc(face.assetId)}
            alt=""
            className="block max-h-[75vh] max-w-full rounded-lg object-contain"
          />
          <span
            className="pointer-events-none absolute rounded-sm border-2 border-[var(--highlight)] shadow-[0_0_0_9999px_rgb(0_0_0/35%)]"
            style={{
              left: `${face.box.left * 100}%`,
              top: `${face.box.top * 100}%`,
              width: `${face.box.width * 100}%`,
              height: `${face.box.height * 100}%`,
            }}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-white p-2">
          <p className="mr-auto px-1 text-sm font-semibold">{title}</p>
          {actions}
          <button type="button" className="btn btn-ghost px-3 py-1.5 text-sm" onClick={onClose}>
            Schliessen
          </button>
        </div>
      </div>
    </div>
  );
}

function personInput(value: string) {
  return value.startsWith(NEW_PREFIX)
    ? { name: value.slice(NEW_PREFIX.length) }
    : { personId: value };
}

const createOption = (name: string) => ({ value: `${NEW_PREFIX}${name}`, label: name });

function useFaceAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  function run(
    action: () => Promise<BulkFaceResult & { propagated?: { confirmed: number; suggested: number } }>,
    onDone?: () => void,
  ) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.propagated) {
        const { confirmed, suggested } = result.propagated;
        if (confirmed + suggested > 0) {
          setNotice(
            [
              confirmed > 0 ? `in ${confirmed} weiteren Fotos erkannt` : null,
              suggested > 0 ? `${suggested} neue Vorschläge` : null,
            ]
              .filter(Boolean)
              .join(", ") + ".",
          );
        }
      }
      onDone?.();
      router.refresh();
    });
  }
  return { pending, error, notice, run };
}

function Feedback({ error, notice }: { error: string | null; notice: string | null }) {
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (notice) return <p className="text-sm font-semibold text-emerald-800">{notice}</p>;
  return null;
}

export function DamPersonCards({ persons }: { persons: PersonCard[] }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {persons.map((person) => (
        <li key={person.id}>
          <Link
            href={`/dam/personen/${person.id}`}
            className="card flex h-full flex-col items-center gap-2 p-3 text-center transition hover:shadow-md"
          >
            {person.avatarFaceId ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={cropSrc(person.avatarFaceId)}
                alt=""
                className="size-24 rounded-full bg-[var(--accent-soft)] object-cover"
              />
            ) : (
              <span className="flex size-24 items-center justify-center rounded-full bg-[var(--accent-soft)]">
                <UserRound className="size-10 text-[var(--accent)]" aria-hidden />
              </span>
            )}
            <span className="w-full truncate font-semibold">{person.name}</span>
            <span className="text-xs text-[var(--muted)]">
              {person.photoCount === 1 ? "1 Foto" : `${person.photoCount} Fotos`}
            </span>
            {person.suggestionCount > 0 ? (
              <span className="rounded-full bg-[var(--highlight)] px-2 py-0.5 text-xs font-semibold">
                {person.suggestionCount} Vorschläge
              </span>
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Grid of unnamed or ignored faces with multi-select actions. */
export function DamFaceTileGrid({
  faces,
  mode,
  allPersons,
}: {
  faces: FaceTile[];
  mode: "unassigned" | "ignored";
  allPersons: { id: string; name: string }[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [viewing, setViewing] = useState<FaceTile | null>(null);
  const { pending, error, notice, run } = useFaceAction();
  const ids = [...selected];
  const clear = () => setSelected(new Set());

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center gap-2 p-3">
        <p className="mr-auto text-sm text-[var(--muted)]">
          {ids.length > 0
            ? `${ids.length} ausgewählt`
            : mode === "unassigned"
              ? "Gesichter anklicken, um sie auszuwählen."
              : "Ignorierte Gesichter erscheinen nicht in der Bildvorschau."}
        </p>
        {ids.length > 0 ? (
          <>
            {mode === "unassigned" ? (
              <>
                <div className="w-64">
                  <DamCombobox
                    key={ids.join(",")}
                    id="face-tiles-assign"
                    label="Person zuweisen"
                    emptyLabel="Person zuweisen…"
                    placeholder="Name suchen oder neu anlegen…"
                    options={allPersons.map((person) => ({ value: person.id, label: person.name }))}
                    value={[]}
                    onCreate={createOption}
                    onChange={(values) => {
                      const value = values[0];
                      if (value) run(() => assignFaces(ids, personInput(value)), clear);
                    }}
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-ghost px-3 py-1.5 text-sm"
                  disabled={pending}
                  onClick={() => run(() => ignoreFaces(ids), clear)}
                >
                  <EyeOff className="size-4" aria-hidden />
                  Ignorieren
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn btn-ghost px-3 py-1.5 text-sm"
                disabled={pending}
                onClick={() => run(() => unignoreFaces(ids), clear)}
              >
                <RotateCcw className="size-4" aria-hidden />
                Zurückholen
              </button>
            )}
            <button
              type="button"
              className="btn btn-ghost px-2 py-1.5"
              aria-label="Auswahl aufheben"
              onClick={clear}
            >
              <X className="size-4" />
            </button>
          </>
        ) : faces.length > 0 ? (
          <button
            type="button"
            className="btn btn-ghost px-3 py-1.5 text-sm"
            onClick={() => setSelected(new Set(faces.map((face) => face.id)))}
          >
            Alle auf dieser Seite wählen
          </button>
        ) : null}
      </div>
      {pending ? <p className="text-sm text-[var(--muted)]">Speichert…</p> : null}
      <Feedback error={error} notice={notice} />

      <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10">
        {faces.map((face) => {
          const isSelected = selected.has(face.id);
          return (
            <li key={face.id} className="group relative">
              <button
                type="button"
                className={`block w-full overflow-hidden rounded-lg ring-offset-2 transition ${
                  isSelected ? "ring-4 ring-[var(--accent)]" : "hover:ring-2 hover:ring-[var(--border)]"
                }`}
                aria-pressed={isSelected}
                aria-label="Gesicht auswählen"
                onClick={() => toggle(face.id)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={cropSrc(face.id)}
                  alt=""
                  loading="lazy"
                  className="aspect-square w-full bg-[var(--accent-soft)] object-cover"
                />
                {isSelected ? (
                  <span className="absolute top-1 left-1 flex size-5 items-center justify-center rounded-full bg-[var(--accent)] text-white">
                    <Check className="size-3.5" aria-hidden />
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                className="absolute top-1 right-1 hidden rounded-full bg-white/90 p-1 shadow group-hover:block focus-visible:block"
                aria-label="Ganzes Foto ansehen"
                title="Ganzes Foto ansehen"
                onClick={() => setViewing(face)}
              >
                <Maximize2 className="size-3" aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>

      {viewing ? (
        <DamFacePhotoDialog
          face={viewing}
          title={mode === "unassigned" ? "Unbenanntes Gesicht" : "Ignoriertes Gesicht"}
          onClose={() => setViewing(null)}
        />
      ) : null}
    </div>
  );
}

export function DamPersonDetailView({ person }: { person: PersonDetail }) {
  const router = useRouter();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(person.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [viewing, setViewing] = useState<FaceTile | null>(null);
  const { pending, error, notice, run } = useFaceAction();
  const suggestionIds = person.suggestions.map((face) => face.id);

  function saveName() {
    const next = name.trim();
    if (!next || next === person.name) {
      setRenaming(false);
      setName(person.name);
      return;
    }
    run(() => renameDamPerson(person.id, next), () => setRenaming(false));
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <Link href="/dam/personen" className="text-sm font-semibold text-[var(--accent)] hover:underline">
            ← Personen
          </Link>
          {renaming ? (
            <form
              className="mt-1 flex flex-wrap gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                saveName();
              }}
            >
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                autoFocus
                aria-label="Name"
                className="min-w-0 flex-1 text-2xl font-semibold"
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setRenaming(false);
                    setName(person.name);
                  }
                }}
              />
              <button type="submit" className="btn btn-primary" disabled={pending}>
                Speichern
              </button>
            </form>
          ) : (
            <h1 className="mt-1 flex items-center gap-2 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
              <span className="truncate">{person.name}</span>
              <button
                type="button"
                className="rounded p-1 text-[var(--accent)] hover:bg-[var(--accent-soft)]"
                aria-label="Umbenennen"
                onClick={() => setRenaming(true)}
              >
                <Pencil className="size-4" />
              </button>
            </h1>
          )}
          <p className="mt-1 text-sm text-[var(--muted)]">
            {person.photos.length === 1 ? "1 Foto" : `${person.photos.length} Fotos`}
            {" · "}Name steht auf allen Fotos auch als Keyword.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-danger"
          disabled={pending}
          onClick={() => setConfirmDelete(true)}
        >
          <Trash2 className="size-4" aria-hidden />
          Person löschen
        </button>
      </header>

      {pending ? <p className="text-sm text-[var(--muted)]">Speichert…</p> : null}
      <Feedback error={error} notice={notice} />

      {person.suggestions.length > 0 ? (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="mr-auto text-lg font-semibold">
              Vorschläge ({person.suggestions.length})
            </h2>
            <button
              type="button"
              className="btn btn-primary px-3 py-1.5 text-sm"
              disabled={pending}
              onClick={() => run(() => assignFaces(suggestionIds, { personId: person.id }))}
            >
              <Check className="size-4" aria-hidden />
              Alle bestätigen
            </button>
            <button
              type="button"
              className="btn btn-ghost px-3 py-1.5 text-sm"
              disabled={pending}
              onClick={() => run(() => rejectFaces(suggestionIds))}
            >
              Alle ablehnen
            </button>
          </div>
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
            {person.suggestions.map((face) => (
              <li key={face.id} className="space-y-1">
                <button
                  type="button"
                  className="block w-full"
                  title="Ganzes Foto ansehen"
                  onClick={() => setViewing(face)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={cropSrc(face.id)}
                    alt=""
                    loading="lazy"
                    className="aspect-square w-full rounded-lg bg-[var(--accent-soft)] object-cover"
                  />
                </button>
                <p className="text-center text-xs text-[var(--muted)]">
                  {face.similarity ? `${Math.round(face.similarity)} %` : ""}
                </p>
                <div className="flex gap-1">
                  <button
                    type="button"
                    className="btn btn-primary flex-1 px-1 py-1 text-xs"
                    disabled={pending}
                    onClick={() => run(() => assignAssetFace(face.id, { personId: person.id }))}
                  >
                    Ja
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost flex-1 px-1 py-1 text-xs"
                    disabled={pending}
                    onClick={() => run(() => rejectFaces([face.id]))}
                  >
                    Nein
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Fotos ({person.photos.length})</h2>
        {person.photos.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Noch keine bestätigten Fotos.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {person.photos.map((photo) => (
              <li key={photo.assetId}>
                <Link
                  href={photoHref(person.name, photo)}
                  className="block overflow-hidden rounded-lg"
                  title={
                    photo.status === "published"
                      ? photo.fileName
                      : `${photo.fileName} (noch in «Meine Uploads»)`
                  }
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={thumbSrc(photo.assetId)}
                    alt={photo.fileName}
                    loading="lazy"
                    className="aspect-[4/3] w-full bg-[var(--accent-soft)] object-cover"
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {person.references.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Referenzgesichter</h2>
          <p className="text-sm text-[var(--muted)]">
            Von Hand bestätigte Gesichter. Daran erkennt das System die Person in neuen Fotos.
          </p>
          <ul className="flex flex-wrap gap-2">
            {person.references.map((face) => (
              <li key={face.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={cropSrc(face.id)}
                  alt=""
                  loading="lazy"
                  className="size-16 rounded-lg bg-[var(--accent-soft)] object-cover"
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {viewing ? (
        <DamFacePhotoDialog
          face={viewing}
          title={`Ist das ${person.name}?`}
          onClose={() => setViewing(null)}
          actions={
            person.suggestions.some((face) => face.id === viewing.id) ? (
              <>
                <button
                  type="button"
                  className="btn btn-primary px-3 py-1.5 text-sm"
                  disabled={pending}
                  onClick={() =>
                    run(
                      () => assignAssetFace(viewing.id, { personId: person.id }),
                      () => setViewing(null),
                    )
                  }
                >
                  Ja
                </button>
                <button
                  type="button"
                  className="btn btn-ghost px-3 py-1.5 text-sm"
                  disabled={pending}
                  onClick={() => run(() => rejectFaces([viewing.id]), () => setViewing(null))}
                >
                  Nein
                </button>
              </>
            ) : null
          }
        />
      ) : null}

      {confirmDelete ? (
        <DamConfirmDialog
          title={`${person.name} löschen?`}
          body={`Der Name wird von ${person.photos.length} Fotos und aus den Keywords entfernt. Die Gesichter bleiben erkannt und erscheinen wieder unter «Unbenannt».`}
          confirmLabel="Person löschen"
          danger
          pending={pending}
          onClose={() => setConfirmDelete(false)}
          onConfirm={() =>
            run(
              () => deleteDamPerson(person.id),
              () => {
                setConfirmDelete(false);
                router.push("/dam/personen");
              },
            )
          }
        />
      ) : null}
    </div>
  );
}
