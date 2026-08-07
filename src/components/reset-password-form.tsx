"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { resetPasswordWithToken } from "@/lib/actions";

export function ResetPasswordForm({
  token,
  userName,
}: {
  token: string;
  userName: string;
}) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwörter stimmen nicht überein.");
      return;
    }
    const fd = new FormData();
    fd.set("token", token);
    fd.set("password", password);
    startTransition(async () => {
      const result = await resetPasswordWithToken(fd);
      if (result?.error) {
        setError(result.error);
        return;
      }
      router.push("/login?reset=1");
      router.refresh();
    });
  }

  return (
    <div className="relative mx-auto flex min-h-full w-full max-w-md flex-col justify-center px-4 py-16">
      <div className="relative mb-8">
        <p className="brand-mark text-sm tracking-[0.04em] text-[var(--fg)] uppercase">
          Tsüri HQ 2.0
        </p>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
          Neues Passwort
        </h1>
        <p className="mt-2 text-[var(--muted)]">
          Hallo {userName.split(" ")[0]} — wähle ein neues Passwort (min. 8
          Zeichen).
        </p>
      </div>

      <div className="relative card p-6">
        {error && (
          <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-[var(--danger)]">
            {error}
          </p>
        )}
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="field">
            <label htmlFor="password">Neues Passwort</label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="confirm">Wiederholen</label>
            <input
              id="confirm"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          <button className="btn btn-primary" type="submit" disabled={pending}>
            {pending ? "…" : "Passwort speichern"}
          </button>
        </form>
      </div>

      <p className="relative mt-6 text-center text-sm text-[var(--muted)]">
        <Link
          href="/login"
          className="font-bold underline decoration-2 underline-offset-2"
        >
          Zum Login
        </Link>
      </p>
    </div>
  );
}
