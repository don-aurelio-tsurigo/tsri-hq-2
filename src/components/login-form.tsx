"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState(searchParams.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const joined = searchParams.get("joined") === "1";

  function onPasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const { error: err } = await authClient.signIn.email({
        email,
        password,
      });
      if (err) {
        setError(err.message ?? "Login fehlgeschlagen.");
        return;
      }
      router.push("/home");
      router.refresh();
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
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-extrabold tracking-tight">
          Willkommen zurück
        </h1>
        <p className="mt-2 text-[var(--muted)]">
          Volle Accounts, private Spaces — kein Gast-Modus.
        </p>
      </div>

      <div className="relative card p-6">
        {joined && (
          <p className="mb-4 rounded-lg bg-[var(--highlight)] px-3 py-2 text-sm font-semibold text-[var(--fg)]">
            Einladung angenommen. Bitte melde dich an.
          </p>
        )}
        {error && (
          <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-[var(--danger)]">
            {error}
          </p>
        )}

        <form onSubmit={onPasswordLogin} className="flex flex-col gap-4">
          <div className="field">
            <label htmlFor="email">E-Mail</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="password">Passwort</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button className="btn btn-primary" type="submit" disabled={pending}>
            {pending ? "…" : "Anmelden"}
          </button>
        </form>
      </div>

      <p className="relative mt-6 text-center text-sm text-[var(--muted)]">
        Noch kein Account? Du brauchst eine{" "}
        <Link href="/invite" className="font-bold underline decoration-2 underline-offset-2">
          Einladung
        </Link>
        .
      </p>
    </div>
  );
}
