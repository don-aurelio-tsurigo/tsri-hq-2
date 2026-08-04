"use client";

import { useMemo, useState, useTransition } from "react";
import {
  createChore,
  deleteChore,
  setChoreAssignees,
  updateChore,
} from "@/lib/actions";

type Member = { id: string; name: string };
type Chore = {
  id: string;
  title: string;
  description: string | null;
  assignments: { user: { id: string; name: string } }[];
};

export function ChorePlan({
  spaceId,
  chores,
  members,
  canEdit,
}: {
  spaceId: string;
  chores: Chore[];
  members: Member[];
  canEdit: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-elevated)] shadow-[var(--shadow)]">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-[var(--border)] bg-[color-mix(in_oklab,var(--bg)_70%,white)] text-xs tracking-wide text-[var(--muted)] uppercase">
            <tr>
              <th className="px-4 py-3 font-semibold">Ämtli</th>
              <th className="px-4 py-3 font-semibold">Beschreibung</th>
              <th className="px-4 py-3 font-semibold">Mitarbeiter:innen</th>
              {canEdit && <th className="px-4 py-3 font-semibold" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {chores.map((chore) => (
              <ChoreRow
                key={chore.id}
                chore={chore}
                members={members}
                canEdit={canEdit}
              />
            ))}
            {chores.length === 0 && (
              <tr>
                <td
                  colSpan={canEdit ? 4 : 3}
                  className="px-4 py-10 text-center text-[var(--muted)]"
                >
                  Noch keine Ämtli. Leg das erste an.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {canEdit && <AddChoreForm spaceId={spaceId} />}
    </div>
  );
}

function ChoreRow({
  chore,
  members,
  canEdit,
}: {
  chore: Chore;
  members: Member[];
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const selectedIds = useMemo(
    () => new Set(chore.assignments.map((a) => a.user.id)),
    [chore.assignments],
  );

  if (editing && canEdit) {
    return (
      <tr className="bg-[var(--accent-soft)]/25">
        <td colSpan={4} className="px-4 py-4">
          <form
            className="grid gap-3"
            action={(fd) => {
              setError(null);
              startTransition(async () => {
                const result = await updateChore(fd);
                if (result?.error) {
                  setError(result.error);
                  return;
                }
                const assignFd = new FormData();
                assignFd.set("id", chore.id);
                for (const id of fd.getAll("assigneeIds")) {
                  assignFd.append("assigneeIds", String(id));
                }
                const assignResult = await setChoreAssignees(assignFd);
                if (assignResult?.error) {
                  setError(assignResult.error);
                  return;
                }
                setEditing(false);
              });
            }}
          >
            <input type="hidden" name="id" value={chore.id} />
            {error && (
              <p className="text-sm text-[var(--danger)]">{error}</p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="field">
                <label htmlFor={`title-${chore.id}`}>Ämtli</label>
                <input
                  id={`title-${chore.id}`}
                  name="title"
                  required
                  defaultValue={chore.title}
                />
              </div>
              <div className="field">
                <label htmlFor={`desc-${chore.id}`}>Beschreibung</label>
                <input
                  id={`desc-${chore.id}`}
                  name="description"
                  defaultValue={chore.description ?? ""}
                />
              </div>
            </div>
            <fieldset className="field">
              <legend className="text-sm font-semibold text-[var(--muted)]">
                Zuweisen
              </legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {members.map((m) => (
                  <label
                    key={m.id}
                    className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-white px-3 py-1 text-sm"
                  >
                    <input
                      type="checkbox"
                      name="assigneeIds"
                      value={m.id}
                      defaultChecked={selectedIds.has(m.id)}
                    />
                    {m.name}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="flex flex-wrap gap-2">
              <button type="submit" className="btn btn-primary" disabled={pending}>
                {pending ? "…" : "Speichern"}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setEditing(false)}
              >
                Abbrechen
              </button>
              <button
                type="button"
                className="btn btn-danger"
                disabled={pending}
                onClick={() => {
                  if (!confirm(`«${chore.title}» wirklich löschen?`)) return;
                  const fd = new FormData();
                  fd.set("id", chore.id);
                  startTransition(async () => {
                    await deleteChore(fd);
                  });
                }}
              >
                Löschen
              </button>
            </div>
          </form>
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td className="px-4 py-3 font-medium align-top">{chore.title}</td>
      <td className="px-4 py-3 align-top text-[var(--muted)]">
        {chore.description || "—"}
      </td>
      <td className="px-4 py-3 align-top">
        <div className="flex flex-wrap gap-1.5">
          {chore.assignments.length === 0 && (
            <span className="text-[var(--muted)]">—</span>
          )}
          {chore.assignments.map((a) => (
            <span key={a.user.id} className="badge">
              {a.user.name}
            </span>
          ))}
        </div>
      </td>
      {canEdit && (
        <td className="px-4 py-3 text-right align-top">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setEditing(true)}
          >
            Bearbeiten
          </button>
        </td>
      )}
    </tr>
  );
}

function AddChoreForm({ spaceId }: { spaceId: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
        + Ämtli hinzufügen
      </button>
    );
  }

  return (
    <form
      className="card flex flex-col gap-3 p-4"
      action={(fd) => {
        setError(null);
        startTransition(async () => {
          const result = await createChore(fd);
          if (result?.error) {
            setError(result.error);
            return;
          }
          setOpen(false);
        });
      }}
    >
      <input type="hidden" name="spaceId" value={spaceId} />
      <h3 className="font-[family-name:var(--font-display)] text-lg font-semibold">
        Neues Ämtli
      </h3>
      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
      <div className="field">
        <label htmlFor="new-chore-title">Name</label>
        <input id="new-chore-title" name="title" required placeholder="z.B. Spüli-Fee" />
      </div>
      <div className="field">
        <label htmlFor="new-chore-desc">Beschreibung</label>
        <textarea
          id="new-chore-desc"
          name="description"
          rows={2}
          placeholder="Was gehört dazu?"
        />
      </div>
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "…" : "Anlegen"}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
          Abbrechen
        </button>
      </div>
    </form>
  );
}
