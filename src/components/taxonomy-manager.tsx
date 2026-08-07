"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export type TaxonomyOption = {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
  active: boolean;
};

type ActionResult = { error?: string; ok?: true } | void;

export function TaxonomyManager({
  title,
  description,
  items,
  newLabel,
  createAction,
  updateAction,
  deleteAction,
  onClose,
}: {
  title: string;
  description: string;
  items: TaxonomyOption[];
  newLabel: string;
  createAction: (fd: FormData) => Promise<ActionResult>;
  updateAction: (fd: FormData) => Promise<ActionResult>;
  deleteAction: (fd: FormData) => Promise<ActionResult>;
  onClose: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [color, setColor] = useState("#e5e7eb");

  function refresh() {
    router.refresh();
  }

  return (
    <div className="card space-y-4 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-[family-name:var(--font-display)] text-lg font-semibold">
            {title}
          </h3>
          <p className="mt-1 text-sm text-[var(--muted)]">{description}</p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Schliessen
        </button>
      </div>

      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

      <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
        {items.map((item) => (
          <li key={item.id} className="px-3 py-2">
            <form
              className="flex flex-wrap items-center gap-2"
              action={(fd) => {
                setError(null);
                startTransition(async () => {
                  const result = await updateAction(fd);
                  if (result?.error) {
                    setError(result.error);
                    return;
                  }
                  refresh();
                });
              }}
            >
              <input type="hidden" name="id" value={item.id} />
              <span
                className="size-4 shrink-0 rounded-full border border-black/10"
                style={{ background: item.color }}
                aria-hidden
              />
              <input
                name="name"
                defaultValue={item.name}
                required
                className="min-w-[8rem] flex-1 rounded-lg border-2 border-[var(--border)] bg-white px-2 py-1 text-sm font-semibold"
              />
              <input
                name="color"
                type="color"
                defaultValue={item.color}
                className="h-8 w-10 cursor-pointer rounded border border-[var(--border)] bg-white p-0.5"
                title="Farbe"
              />
              <select
                name="active"
                defaultValue={item.active ? "true" : "false"}
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
                  if (!confirm(`«${item.name}» wirklich löschen?`)) return;
                  setError(null);
                  const fd = new FormData();
                  fd.set("id", item.id);
                  startTransition(async () => {
                    const result = await deleteAction(fd);
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
        {items.length === 0 && (
          <li className="px-3 py-4 text-center text-sm text-[var(--muted)]">
            Noch keine Einträge.
          </li>
        )}
      </ul>

      <form
        className="flex flex-wrap items-end gap-2 border-t border-[var(--border)] pt-3"
        action={(fd) => {
          setError(null);
          startTransition(async () => {
            const result = await createAction(fd);
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
          <label htmlFor="taxonomy-new-name">{newLabel}</label>
          <input
            id="taxonomy-new-name"
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="Name"
          />
        </div>
        <div className="field">
          <label htmlFor="taxonomy-new-color">Farbe</label>
          <input
            id="taxonomy-new-color"
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

export function TaxonomyBadge({
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
