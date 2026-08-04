"use client";

import { useState, useTransition } from "react";
import { createInvitation, revokeInvitation } from "@/lib/actions";

export function InviteMemberForm({ appUrl }: { appUrl: string }) {
  const [error, setError] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setInviteUrl(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await createInvitation(formData);
      if (result.error) {
        setError(result.error);
        if ("token" in result && result.token) {
          setInviteUrl(`${appUrl}/invite/${result.token}`);
        }
        return;
      }
      if (result.token) {
        setInviteUrl(`${appUrl}/invite/${result.token}`);
        (e.target as HTMLFormElement).reset();
      }
    });
  }

  return (
    <div className="card p-5">
      <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
        Person einladen
      </h2>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Einladung erstellen und den Link teilen. Die Person bekommt einen vollen
        Account inkl. privatem Space.
      </p>
      <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="field flex-1">
          <label htmlFor="email">E-Mail</label>
          <input id="email" name="email" type="email" required />
        </div>
        <div className="field w-full sm:w-40">
          <label htmlFor="role">Rolle</label>
          <select id="role" name="role" defaultValue="member">
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? "…" : "Einladen"}
        </button>
      </form>
      {error && (
        <p className="mt-3 text-sm text-[var(--danger)]">{error}</p>
      )}
      {inviteUrl && (
        <div className="mt-3 rounded-lg bg-[var(--accent-soft)] px-3 py-2 text-sm">
          <p className="font-semibold text-[var(--accent)]">Einladungslink</p>
          <code className="mt-1 block break-all text-[var(--fg)]">{inviteUrl}</code>
        </div>
      )}
    </div>
  );
}

export function RevokeInviteButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <form
      action={(fd) => {
        startTransition(async () => {
          await revokeInvitation(fd);
        });
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button className="btn btn-danger" type="submit" disabled={pending}>
        Widerrufen
      </button>
    </form>
  );
}
