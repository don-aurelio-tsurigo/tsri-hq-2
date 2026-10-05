"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Check, EyeOff, ScanFace, UserRound, X } from "lucide-react";
import { DamCombobox } from "@/components/dam-combobox";
import {
  addAssetPerson,
  assignAssetFace,
  ignoreAssetFace,
  rejectAssetFace,
  removeAssetPersonAction,
  type FaceActionResult,
} from "@/lib/actions/dam-faces";
import type { AssetFacesState, AssetFaceView } from "@/lib/dam/face-assign";

export type DamFacesData = AssetFacesState & {
  allPersons: { id: string; name: string }[];
  canEdit: boolean;
  /** FACE_RECOGNITION_ENABLED — otherwise pending assets are not «running». */
  scanEnabled: boolean;
};

const NEW_PREFIX = "new:";

function personInput(value: string) {
  return value.startsWith(NEW_PREFIX)
    ? { name: value.slice(NEW_PREFIX.length) }
    : { personId: value };
}

function cropSrc(faceId: string) {
  return `/api/dam/faces/${faceId}/crop`;
}

/**
 * Faces + «Personen» of the asset shown in a preview. `onKeywords` mirrors the
 * server-side keyword sync into the parent list without another save.
 */
export function useDamFaces(
  assetId: string | undefined,
  onKeywords: (assetId: string, keywords: string[]) => void,
) {
  const [data, setData] = useState<DamFacesData | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | undefined>(undefined);
  const [selectedFaceId, setSelectedFaceId] = useState<string | null>(null);
  const [showFaces, setShowFaces] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (assetId !== loadedFor) {
    setLoadedFor(assetId);
    setData(null);
    setSelectedFaceId(null);
    setError(null);
    setNotice(null);
  }

  const load = useCallback(async (id: string, signal?: AbortSignal) => {
    const res = await fetch(`/api/dam/assets/${id}/faces`, { signal });
    if (!res.ok) return null;
    return (await res.json()) as DamFacesData;
  }, []);

  useEffect(() => {
    if (!assetId) return;
    const controller = new AbortController();
    load(assetId, controller.signal)
      .then((next) => {
        if (next) setData(next);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [assetId, load]);

  function run(action: () => Promise<FaceActionResult>, reloadPersons = false) {
    if (!assetId) return;
    const id = assetId;
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await action();
      if (result.error || !result.state) {
        setError(result.error ?? "Aktion fehlgeschlagen.");
        return;
      }
      const state = result.state;
      setData((prev) => (prev ? { ...prev, ...state } : prev));
      onKeywords(id, state.keywords);
      if (result.propagated) {
        const { confirmed, suggested } = result.propagated;
        const parts = [
          confirmed > 0 ? `in ${confirmed} weiteren Fotos erkannt` : null,
          suggested > 0 ? `${suggested} Vorschläge zum Bestätigen` : null,
        ].filter(Boolean);
        if (parts.length > 0) setNotice(parts.join(", ") + ".");
      }
      if (reloadPersons) {
        const fresh = await load(id);
        if (fresh) setData(fresh);
      }
    });
  }

  const actions = {
    assign(faceId: string, value: string) {
      run(() => assignAssetFace(faceId, personInput(value)), value.startsWith(NEW_PREFIX));
    },
    reject(faceId: string) {
      run(() => rejectAssetFace(faceId));
    },
    ignore(faceId: string) {
      setSelectedFaceId(null);
      run(() => ignoreAssetFace(faceId));
    },
    addPerson(value: string) {
      if (!assetId) return;
      run(() => addAssetPerson(assetId, personInput(value)), value.startsWith(NEW_PREFIX));
    },
    removePerson(personId: string) {
      if (!assetId) return;
      run(() => removeAssetPersonAction(assetId, personId));
    },
  };

  const visibleFaces = (data?.faces ?? []).filter((face) => face.status !== "ignored");

  return {
    data,
    visibleFaces,
    selectedFaceId,
    selectFace(faceId: string | null) {
      setSelectedFaceId(faceId);
      if (faceId) setShowFaces(true);
    },
    showFaces,
    setShowFaces,
    pending,
    error,
    notice,
    actions,
  };
}

export type DamFacesController = ReturnType<typeof useDamFaces>;

function boxStyle(face: AssetFaceView) {
  return {
    left: `${face.box.left * 100}%`,
    top: `${face.box.top * 100}%`,
    width: `${face.box.width * 100}%`,
    height: `${face.box.height * 100}%`,
  };
}

/** Bounding boxes over the unedited image; parent must be `relative` and sized to the image. */
export function DamFaceOverlay({ faces }: { faces: DamFacesController }) {
  if (!faces.showFaces) return null;
  return (
    <>
      {faces.visibleFaces.map((face) => {
        const selected = face.id === faces.selectedFaceId;
        const tone =
          face.status === "confirmed"
            ? "border-solid border-[var(--highlight)]"
            : face.status === "suggested"
              ? "border-dashed border-amber-300"
              : "border-dashed border-white";
        const label =
          face.status === "confirmed"
            ? face.personName
            : face.status === "suggested"
              ? `${face.personName}?`
              : "Person zuweisen";
        return (
          <button
            key={face.id}
            type="button"
            style={boxStyle(face)}
            className={`group absolute rounded-sm border-2 ${tone} ${
              selected ? "ring-2 ring-white ring-offset-1 ring-offset-black/40" : ""
            } bg-transparent transition hover:bg-white/10`}
            aria-label={label ?? "Gesicht"}
            onClick={(e) => {
              e.stopPropagation();
              faces.selectFace(selected ? null : face.id);
            }}
          >
            <span className="absolute top-full left-1/2 mt-1 max-w-[12rem] -translate-x-1/2 truncate rounded bg-black/75 px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap text-white">
              {label}
            </span>
          </button>
        );
      })}
    </>
  );
}

/** Toggle for the image toolbar. */
export function DamFaceToggle({ faces }: { faces: DamFacesController }) {
  const count = faces.visibleFaces.length;
  if (count === 0) return null;
  return (
    <button
      type="button"
      // Off: outlined in highlight yellow so it stays visible on the dark stage.
      className={`btn px-3 ${
        faces.showFaces
          ? "btn-highlight"
          : "!border-[var(--highlight)] !bg-transparent !text-[var(--highlight)] hover:!bg-white/10"
      }`}
      aria-pressed={faces.showFaces}
      onClick={() => {
        faces.setShowFaces(!faces.showFaces);
        if (faces.showFaces) faces.selectFace(null);
      }}
    >
      <ScanFace className="size-4" aria-hidden />
      Gesichter ({count})
    </button>
  );
}

function FaceCrop({ faceId, size = "size-12" }: { faceId: string; size?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={cropSrc(faceId)}
      alt=""
      className={`${size} shrink-0 rounded-md bg-[var(--accent-soft)] object-cover`}
    />
  );
}

function personOptions(data: DamFacesData) {
  return data.allPersons.map((person) => ({ value: person.id, label: person.name }));
}

const createOption = (name: string) => ({ value: `${NEW_PREFIX}${name}`, label: name });

/** «Personen» block for the preview sidebar. */
export function DamPersonsField({
  assetId,
  faces,
}: {
  assetId: string;
  faces: DamFacesController;
}) {
  const data = faces.data;
  if (!data) {
    return (
      <div>
        <p className="text-xs font-semibold text-[var(--muted)]">Personen</p>
        <p className="mt-0.5 text-sm text-[var(--muted)]">…</p>
      </div>
    );
  }

  const selected = faces.visibleFaces.find((face) => face.id === faces.selectedFaceId) ?? null;
  const suggestions = faces.visibleFaces.filter((face) => face.status === "suggested");
  const unnamed = faces.visibleFaces.filter((face) => face.status === "unassigned");
  const scanning =
    data.scanEnabled && (data.faceStatus === "pending" || data.faceStatus === "processing");

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-[var(--muted)]">Personen</p>

      {data.persons.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">Keine</p>
      ) : (
        <div className="flex flex-wrap gap-1">
          {data.persons.map((person) => (
            <span
              key={person.id}
              className="inline-flex max-w-full items-center gap-1 rounded-full bg-[var(--accent-soft)] py-0.5 pl-2 pr-0.5 text-xs font-semibold"
              title={person.source === "face" ? "Über Gesichtserkennung" : "Von Hand gesetzt"}
            >
              <UserRound className="size-3 shrink-0" aria-hidden />
              <span className="truncate">{person.name}</span>
              {data.canEdit ? (
                <button
                  type="button"
                  className="rounded-full p-0.5 hover:bg-white/70"
                  aria-label={`${person.name} entfernen`}
                  disabled={faces.pending}
                  onClick={() => faces.actions.removePerson(person.id)}
                >
                  <X className="size-2.5" />
                </button>
              ) : null}
            </span>
          ))}
        </div>
      )}

      {scanning ? (
        <p className="text-xs text-[var(--muted)]">Gesichtserkennung läuft noch…</p>
      ) : null}

      {data.canEdit && suggestions.length > 0 ? (
        <ul className="space-y-1.5">
          {suggestions.map((face) => (
            <li key={face.id} className="flex items-center gap-2">
              <button type="button" onClick={() => faces.selectFace(face.id)} aria-label="Im Bild zeigen">
                <FaceCrop faceId={face.id} size="size-9" />
              </button>
              <p className="min-w-0 flex-1 truncate text-sm">
                Ist das <strong>{face.personName}</strong>?
              </p>
              <button
                type="button"
                className="btn btn-primary px-2 py-1 text-xs"
                disabled={faces.pending}
                onClick={() => face.personId && faces.actions.assign(face.id, face.personId)}
              >
                <Check className="size-3.5" aria-hidden />
                Ja
              </button>
              <button
                type="button"
                className="btn btn-ghost px-2 py-1 text-xs"
                disabled={faces.pending}
                onClick={() => faces.actions.reject(face.id)}
              >
                Nein
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {data.canEdit && !selected && unnamed.length > 0 ? (
        <div>
          <p className="text-xs text-[var(--muted)]">
            {unnamed.length === 1 ? "1 unbenanntes Gesicht" : `${unnamed.length} unbenannte Gesichter`}
          </p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {unnamed.map((face) => (
              <button
                key={face.id}
                type="button"
                className="rounded-md ring-[var(--accent)] hover:ring-2"
                aria-label="Gesicht benennen"
                onClick={() => faces.selectFace(face.id)}
              >
                <FaceCrop faceId={face.id} size="size-10" />
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {data.canEdit && selected ? (
        <div className="space-y-2 rounded-lg border border-[var(--border)] p-2">
          <div className="flex items-center gap-2">
            <FaceCrop faceId={selected.id} />
            <p className="min-w-0 flex-1 text-sm">
              {selected.status === "confirmed" ? (
                <strong>{selected.personName}</strong>
              ) : (
                "Wer ist das?"
              )}
            </p>
            <button
              type="button"
              className="btn btn-ghost shrink-0 px-1.5"
              aria-label="Auswahl schliessen"
              onClick={() => faces.selectFace(null)}
            >
              <X className="size-3.5" />
            </button>
          </div>
          <DamCombobox
            key={selected.id}
            id={`face-assign-${selected.id}`}
            label="Person zuweisen"
            emptyLabel="Person suchen…"
            placeholder="Name suchen oder neu anlegen…"
            options={personOptions(data)}
            value={[]}
            onCreate={createOption}
            onChange={(ids) => {
              const value = ids[0];
              if (value) faces.actions.assign(selected.id, value);
            }}
          />
          <div className="flex flex-wrap gap-1.5">
            {selected.status === "confirmed" ? (
              <button
                type="button"
                className="btn btn-ghost px-2 py-1 text-xs"
                disabled={faces.pending}
                onClick={() => faces.actions.reject(selected.id)}
              >
                Nicht {selected.personName}
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn-ghost px-2 py-1 text-xs"
              disabled={faces.pending}
              onClick={() => faces.actions.ignore(selected.id)}
            >
              <EyeOff className="size-3.5" aria-hidden />
              Ignorieren
            </button>
          </div>
        </div>
      ) : null}

      {data.canEdit ? (
        <DamCombobox
          id={`asset-add-person-${assetId}`}
          label="Person hinzufügen"
          emptyLabel="Person hinzufügen…"
          placeholder="Name suchen oder neu anlegen…"
          options={personOptions(data).filter(
            (option) => !data.persons.some((person) => person.id === option.value),
          )}
          value={[]}
          onCreate={createOption}
          onChange={(ids) => {
            const value = ids[0];
            if (value) faces.actions.addPerson(value);
          }}
        />
      ) : null}

      {faces.pending ? <p className="text-xs text-[var(--muted)]">Speichert…</p> : null}
      {faces.error ? <p className="text-sm text-red-600">{faces.error}</p> : null}
      {faces.notice ? (
        <p className="text-sm font-semibold text-emerald-800">{faces.notice}</p>
      ) : null}
    </div>
  );
}
