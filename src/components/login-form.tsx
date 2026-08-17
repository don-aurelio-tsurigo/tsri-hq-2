"use client";

import { useRef, useState, useTransition } from "react";
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
  const passwordRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState(searchParams.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(
    searchParams.get("joined") === "1" || searchParams.get("reset") === "1",
  );
  const [error, setError] = useState<string | null>(
    magicLinkErrorMessage(searchParams.get("error")),
  );
  const [linkSent, setLinkSent] = useState(false);
  const [pending, startTransition] = useTransition();
  const joined = searchParams.get("joined") === "1";
  const resetOk = searchParams.get("reset") === "1";

  function revealPassword() {
    setShowPassword(true);
    setError(null);
    setLinkSent(false);
    requestAnimationFrame(() => passwordRef.current?.focus());
  }

  function hidePassword() {
    setShowPassword(false);
    setPassword("");
    setError(null);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (showPassword) {
      onPasswordLogin();
      return;
    }
    onMagicLink();
  }

  function onPasswordLogin() {
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
          Login-Link per E-Mail — oder mit Passwort, falls du eines hast.
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

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
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
          {showPassword ? (
            <div className="field">
              <label htmlFor="password">Passwort</label>
              <input
                ref={passwordRef}
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          ) : null}
          <button className="btn btn-primary" type="submit" disabled={pending}>
            {pending
              ? "…"
              : showPassword
                ? "Anmelden"
                : "Login-Link schicken"}
          </button>
        </form>

        {showPassword ? (
          <button
            type="button"
            className="mt-4 w-full text-center text-sm font-semibold text-[var(--muted)] underline decoration-2 underline-offset-2 hover:text-[var(--fg)]"
            disabled={pending}
            onClick={hidePassword}
          >
            Lieber Login-Link per E-Mail
          </button>
        ) : (
          <button
            type="button"
            className="mt-4 w-full text-center text-sm font-semibold text-[var(--muted)] underline decoration-2 underline-offset-2 hover:text-[var(--fg)]"
            disabled={pending}
            onClick={revealPassword}
          >
            Mit Passwort anmelden
          </button>
        )}
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
