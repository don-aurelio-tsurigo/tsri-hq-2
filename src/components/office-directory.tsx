"use client";

import { useState, useTransition } from "react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { updateMemberProfile } from "@/lib/actions";
import { PensumSelect } from "@/components/pensum-select";

export type OfficePerson = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  birthDate: string | null; // ISO date yyyy-mm-dd
  pensumPercent: number;
};

function toInputDate(iso: string | null) {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function displayBirth(iso: string | null) {
  if (!iso) return "—";
  return format(new Date(iso), "d. MMMM yyyy", { locale: de });
}

export function OfficeDirectory({
  people,
  currentUserId,
  isAdmin,
}: {
  people: OfficePerson[];
  currentUserId: string;
  isAdmin: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-elevated)] shadow-[var(--shadow)]">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-[var(--border)] bg-[color-mix(in_oklab,var(--bg)_70%,white)] text-xs tracking-wide text-[var(--muted)] uppercase">
            <tr>
              <th className="px-4 py-3 font-semibold">Name</th>
              <th className="px-4 py-3 font-semibold">Pensum</th>
              <th className="px-4 py-3 font-semibold">Telefon</th>
              <th className="px-4 py-3 font-semibold">Geburtsdatum</th>
              <th className="px-4 py-3 font-semibold">E-Mail</th>
              <th className="px-4 py-3 font-semibold" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {people.map((person) => (
              <PersonRow
                key={person.id}
                person={person}
                canEdit={isAdmin || person.id === currentUserId}
                isAdmin={isAdmin}
              />
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-[var(--muted)]">
        Jede:r kann die eigenen Kontaktdaten pflegen. Das Arbeitspensum (für die
        Stundenerfassung) setzen nur Admins.
      </p>
    </div>
  );
}

function PersonRow({
  person,
  canEdit,
  isAdmin,
}: {
  person: OfficePerson;
  canEdit: boolean;
  isAdmin: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!editing) {
    return (
      <tr>
        <td className="px-4 py-3 font-medium">{person.name}</td>
        <td className="px-4 py-3">
          {isAdmin ? (
            <PensumSelect
              userId={person.id}
              pensumPercent={person.pensumPercent}
              compact
            />
          ) : (
            <span className="font-semibold tabular-nums">
              {person.pensumPercent}%
            </span>
          )}
        </td>
        <td className="px-4 py-3 tabular-nums">
          {person.phone ? (
            <a href={`tel:${person.phone}`} className="text-[var(--accent)] hover:underline">
              {person.phone}
            </a>
          ) : (
            <span className="text-[var(--muted)]">—</span>
          )}
        </td>
        <td className="px-4 py-3">{displayBirth(person.birthDate)}</td>
        <td className="px-4 py-3 text-[var(--muted)]">{person.email}</td>
        <td className="px-4 py-3 text-right">
          {canEdit && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setEditing(true)}
            >
              Bearbeiten
            </button>
          )}
        </td>
      </tr>
    );
  }

  return (
    <tr className="bg-[var(--accent-soft)]/30">
      <td colSpan={6} className="px-4 py-4">
        <form
          className="grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end"
          action={(fd) => {
            setError(null);
            startTransition(async () => {
              const result = await updateMemberProfile(fd);
              if (result?.error) {
                setError(result.error);
                return;
              }
              setEditing(false);
            });
          }}
        >
          <input type="hidden" name="userId" value={person.id} />
          <div>
            <p className="mb-2 font-medium">{person.name}</p>
            <p className="mb-2 text-sm text-[var(--muted)]">
              Pensum {person.pensumPercent}%
              {isAdmin ? " — über die Spalte änderbar" : ""}
            </p>
            {error && (
              <p className="mb-2 text-sm text-[var(--danger)]">{error}</p>
            )}
          </div>
          <div className="field sm:col-span-1">
            <label htmlFor={`phone-${person.id}`}>Telefon</label>
            <input
              id={`phone-${person.id}`}
              name="phone"
              type="tel"
              defaultValue={person.phone ?? ""}
              placeholder="+41 …"
            />
          </div>
          <div className="field">
            <label htmlFor={`birth-${person.id}`}>Geburtsdatum</label>
            <input
              id={`birth-${person.id}`}
              name="birthDate"
              type="date"
              defaultValue={toInputDate(person.birthDate)}
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setEditing(false)}
            >
              Abbrechen
            </button>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? "…" : "Speichern"}
            </button>
          </div>
        </form>
      </td>
    </tr>
  );
}
