"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  createEigenleistungRubrik,
  deleteEigenleistungRubrik,
  updateEigenleistungRubrik,
} from "@/lib/actions";

export type RubrikOption = {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
  active: boolean;
};

export function EigenleistungRubrikManager({
  rubriken,
}: {
  rubriken: RubrikOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [color, setColor] = useState("#e5e7eb");

  function refresh() {
    router.refresh();
  }

  if (!open) {
    return (
      <button
        type="button"
        className="btn btn-ghost text-sm"
        onClick={() => setOpen(true)}
      >
        Eigenleistungs-Rubriken bearbeiten
      </button>
    );
  }

  return (
    <div className="card space-y-4 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-[family-name:var(--font-display)] text-lg font-semibold">
            Eigenleistungs-Rubriken
          </h3>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Neben der Artikel-Kategorie. Name und Farbe sind editierbar.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => setOpen(false)}
        >
          Schliessen
        </button>
      </div>

      {error && (
        <p className="text-sm text-[var(--danger)]">{error}</p>
      )}

      <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
        {rubriken.map((r) => (
          <li key={r.id} className="px-3 py-2">
            <form
              className="flex flex-wrap items-center gap-2"
              action={(fd) => {
                setError(null);
                startTransition(async () => {
                  const result = await updateEigenleistungRubrik(fd);
                  if (result?.error) {
                    setError(result.error);
                    return;
                  }
                  refresh();
                });
              }}
            >
              <input type="hidden" name="id" value={r.id} />
              <span
                className="size-4 shrink-0 rounded-full border border-black/10"
                style={{ background: r.color }}
                aria-hidden
              />
              <input
                name="name"
                defaultValue={r.name}
                required
                className="min-w-[8rem] flex-1 rounded-lg border-2 border-[var(--border)] bg-white px-2 py-1 text-sm font-semibold"
              />
              <input
                name="color"
                type="color"
                defaultValue={r.color}
                className="h-8 w-10 cursor-pointer rounded border border-[var(--border)] bg-white p-0.5"
                title="Farbe"
              />
              <select
                name="active"
                defaultValue={r.active ? "true" : "false"}
                className="rounded-lg border-2 border-[var(--border)] bg-white px-2 py-1 text-xs font-semibold"
              >
                <option value="true">Aktiv</option>
                <option value="false">Inaktiv</option>
              </select>
              <button
                type="submit"
                className="btn btn-primary text-xs"
                disabled={pending}
              >
                Speichern
              </button>
              <button
                type="button"
                className="btn btn-danger text-xs"
                disabled={pending}
                onClick={() => {
                  if (!confirm(`«${r.name}» wirklich löschen?`)) return;
                  setError(null);
                  const fd = new FormData();
                  fd.set("id", r.id);
                  startTransition(async () => {
                    const result = await deleteEigenleistungRubrik(fd);
                    if (result?.error) {
                      setError(result.error);
                      return;
                    }
                    refresh();
                  });
                }}
              >
                Löschen
              </button>
            </form>
          </li>
        ))}
        {rubriken.length === 0 && (
          <li className="px-3 py-4 text-center text-sm text-[var(--muted)]">
            Noch keine Rubriken.
          </li>
        )}
      </ul>

      <form
        className="flex flex-wrap items-end gap-2 border-t border-[var(--border)] pt-3"
        action={(fd) => {
          setError(null);
          startTransition(async () => {
            const result = await createEigenleistungRubrik(fd);
            if (result?.error) {
              setError(result.error);
              return;
            }
            setName("");
            setColor("#e5e7eb");
            refresh();
          });
        }}
      >
        <div className="field min-w-[10rem] flex-1">
          <label htmlFor="new-rubrik-name">Neue Rubrik</label>
          <input
            id="new-rubrik-name"
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="z.B. Wohnbrief"
          />
        </div>
        <div className="field">
          <label htmlFor="new-rubrik-color">Farbe</label>
          <input
            id="new-rubrik-color"
            name="color"
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
          />
        </div>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          Hinzufügen
        </button>
      </form>
    </div>
  );
}

export function RubrikBadge({
  name,
  color,
}: {
  name: string;
  color: string;
}) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[0.7rem] font-bold"
      style={{
        background: color,
        color: "#1a1a1a",
      }}
    >
      {name}
    </span>
  );
}
