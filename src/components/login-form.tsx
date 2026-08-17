"use client";

import { useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { LOGIN_LINK_EXPIRES_MINUTES } from "@/lib/email-constants";

function magicLinkErrorMessage(code: string | null) {
  if (!code) return null;
  if (code === "INVALID_TOKEN") {
    return "Dieser Login-Link ist ungültig oder abgelaufen.";
  }
  if (code === "new_user_signup_disabled") {
    return "Kein Account für diese E-Mail. Du brauchst eine Einladung.";
  }
  return "Login-Link fehlgeschlagen. Bitte noch einmal anfordern.";
}

export function LoginForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState(searchParams.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(
    magicLinkErrorMessage(searchParams.get("error")),
  );
  const [linkSent, setLinkSent] = useState(false);
  const [pending, startTransition] = useTransition();
  const joined = searchParams.get("joined") === "1";
  const resetOk = searchParams.get("reset") === "1";

  function onPasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLinkSent(false);
    startTransition(async () => {
      try {
        const { error: err } = await authClient.signIn.email({
          email,
          password,
          callbackURL: "/home",
        });
        if (err) {
          setError(err.message ?? "Login fehlgeschlagen.");
          return;
        }
        // Hard navigation avoids soft-nav hanging on first /home compile in dev.
        window.location.assign("/home");
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Login fehlgeschlagen (Netzwerk).",
        );
      }
    });
  }

  function onMagicLink() {
    setError(null);
    setLinkSent(false);
    if (!email.trim()) {
      setError("Bitte E-Mail angeben.");
      return;
    }
    startTransition(async () => {
      try {
        const { error: err } = await authClient.signIn.magicLink({
          email,
          callbackURL: "/home",
          errorCallbackURL: "/login",
        });
        if (err) {
          setError(err.message ?? "Login-Link konnte nicht gesendet werden.");
          return;
        }
        setLinkSent(true);
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message
            : "Login-Link konnte nicht gesendet werden.",
        );
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
        {resetOk && (
          <p className="mb-4 rounded-lg bg-[var(--highlight)] px-3 py-2 text-sm font-semibold text-[var(--fg)]">
            Passwort gespeichert. Bitte melde dich an.
          </p>
        )}
        {linkSent && (
          <p className="mb-4 rounded-lg bg-[var(--highlight)] px-3 py-2 text-sm font-semibold text-[var(--fg)]">
            Falls ein Account existiert, ist der Login-Link unterwegs. Er ist{" "}
            {LOGIN_LINK_EXPIRES_MINUTES} Minuten gültig.
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

        <div className="mt-5 flex items-center gap-3 text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">
          <span className="h-px flex-1 bg-[var(--border)]" />
          oder
          <span className="h-px flex-1 bg-[var(--border)]" />
        </div>

        <button
          type="button"
          className="btn btn-ghost mt-4 w-full"
          disabled={pending}
          onClick={onMagicLink}
        >
          {pending ? "…" : "Login-Link per E-Mail"}
        </button>
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
