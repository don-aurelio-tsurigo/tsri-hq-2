"use client";

import { useState, useTransition } from "react";
import { acceptInvitation } from "@/lib/actions";

export function AcceptInviteForm({
  token,
  email,
  orgName,
}: {
  token: string;
  email: string;
  orgName: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await acceptInvitation(formData);
      if (result?.error) {
        setError(result.error);
      }
    });
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center px-4 py-16">
      <div className="mb-8">
        <p className="brand-mark text-sm tracking-[0.04em] text-[var(--accent)] uppercase">
          Tsüri HQ 2.0
        </p>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
          Einladung annehmen
        </h1>
        <p className="mt-2 text-[var(--muted)]">
          Du wurdest zu <strong>{orgName}</strong> eingeladen als{" "}
          <strong>{email}</strong>. Danach hast du einen echten privaten Space.
        </p>
      </div>

      <form onSubmit={onSubmit} className="card flex flex-col gap-4 p-6">
        <input type="hidden" name="token" value={token} />
        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-[var(--danger)]">
            {error}
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="field">
            <label htmlFor="firstName">Vorname</label>
            <input
              id="firstName"
              name="firstName"
              autoComplete="given-name"
              required
              minLength={1}
              maxLength={80}
            />
          </div>
          <div className="field">
            <label htmlFor="lastName">Nachname</label>
            <input
              id="lastName"
              name="lastName"
              autoComplete="family-name"
              required
              minLength={1}
              maxLength={80}
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="password">Passwort wählen</label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
          />
        </div>
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? "…" : "Beitreten & privaten Space anlegen"}
        </button>
      </form>
    </div>
  );
}
