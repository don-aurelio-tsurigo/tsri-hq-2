"use client";

import { useState, useTransition } from "react";
import { completeOwnName } from "@/lib/actions";

export function CompleteProfileForm({
  defaultFirstName,
  defaultLastName,
}: {
  defaultFirstName: string;
  defaultLastName: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await completeOwnName(formData);
      if (result?.error) {
        setError(result.error);
      }
    });
  }

  return (
    <div className="relative mx-auto flex min-h-full w-full max-w-md flex-col justify-center px-4 py-16">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-40 opacity-90"
        style={{ background: "var(--gradient-blue)" }}
        aria-hidden
      />
      <div className="relative mb-8">
        <p className="brand-mark text-sm tracking-[0.04em] text-[var(--fg)] uppercase">
          Tsüri HQ 2.0
        </p>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
          Wie heisst du?
        </h1>
        <p className="mt-2 text-[var(--muted)]">
          Vor- und Nachname sind Pflicht — einmalig beim ersten Anmelden, danach
          können Admins sie anpassen.
        </p>
      </div>

      <form onSubmit={onSubmit} className="relative card flex flex-col gap-4 p-6">
        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-[var(--danger)]">
            {error}
          </p>
        )}
        <div className="field">
          <label htmlFor="firstName">Vorname</label>
          <input
            id="firstName"
            name="firstName"
            autoComplete="given-name"
            required
            minLength={1}
            maxLength={80}
            defaultValue={defaultFirstName}
            autoFocus
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
            defaultValue={defaultLastName}
          />
        </div>
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? "…" : "Weiter"}
        </button>
      </form>
    </div>
  );
}
