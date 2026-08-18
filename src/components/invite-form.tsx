"use client";

import { useState, useTransition } from "react";
import { createInvitation, revokeInvitation } from "@/lib/actions";

export function InviteMemberForm({ appUrl }: { appUrl: string }) {
  const [open, setOpen] = useState(false);
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

  if (!open) {
    return (
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => setOpen(true)}
      >
        Person einladen
      </button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="card flex w-full max-w-xl flex-col gap-3 p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
          Person einladen
        </h2>
        <button
          type="button"
          className="btn btn-ghost px-3 py-1.5 text-sm"
          onClick={() => {
            setOpen(false);
            setError(null);
            setInviteUrl(null);
          }}
        >
          Abbrechen
        </button>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="field flex-1">
          <label htmlFor="email">E-Mail</label>
          <input id="email" name="email" type="email" required />
        </div>
        <div className="field w-full sm:w-40">
          <label htmlFor="role">Rolle</label>
          <select id="role" name="role" defaultValue="member">
            <option value="member">Mitglied</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? "…" : "Einladen"}
        </button>
      </div>
      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
      {inviteUrl && <InviteLink url={inviteUrl} />}
    </form>
  );
}

function InviteLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="rounded-lg bg-[var(--accent-soft)] px-3 py-2 text-sm">
      <p className="font-semibold text-[var(--accent)]">Einladungslink</p>
      <code className="mt-1 block break-all text-[var(--fg)]">{url}</code>
      <button
        type="button"
        className="btn btn-ghost mt-2 px-3 py-1.5 text-sm"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? "Kopiert" : "Link kopieren"}
      </button>
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
      <button
        className="btn btn-ghost px-3 py-1.5 text-sm text-[var(--danger)]"
        type="submit"
        disabled={pending}
      >
        Widerrufen
      </button>
    </form>
  );
}
