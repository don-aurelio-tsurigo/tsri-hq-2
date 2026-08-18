"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  adminCreatePasswordResetLink,
  adminSetMemberPassword,
} from "@/lib/actions";

export function MemberPasswordHelp({
  userId,
  name,
}: {
  userId: string;
  name: string;
}) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [resetUrl, setResetUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSetPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (password !== confirm) {
      setError("Passwörter stimmen nicht überein.");
      return;
    }
    const fd = new FormData();
    fd.set("userId", userId);
    fd.set("password", password);
    startTransition(async () => {
      const result = await adminSetMemberPassword(fd);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setPassword("");
      setConfirm("");
      setResetUrl(null);
      setSuccess(`Neues Passwort für «${name}» gespeichert.`);
      router.refresh();
    });
  }

  function onCreateLink() {
    setError(null);
    setSuccess(null);
    setCopied(false);
    const fd = new FormData();
    fd.set("userId", userId);
    startTransition(async () => {
      const result = await adminCreatePasswordResetLink(fd);
      if (result?.error) {
        setError(result.error);
        return;
      }
      if (result?.ok && result.url) {
        setResetUrl(result.url);
        setSuccess(
          "Reset-Link erzeugt (48 Std. gültig). Link kopieren und teilen.",
        );
      }
    });
  }

  async function copyLink() {
    if (!resetUrl) return;
    try {
      await navigator.clipboard.writeText(resetUrl);
      setCopied(true);
    } catch {
      setError("Kopieren fehlgeschlagen — Link manuell markieren.");
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={onSetPassword} className="space-y-2">
        <p className="text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">
          Neues Passwort setzen
        </p>
        <label className="field text-xs font-semibold text-[var(--muted)]">
          Passwort
          <input
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <label className="field text-xs font-semibold text-[var(--muted)]">
          Wiederholen
          <input
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </label>
        <button
          type="submit"
          className="btn btn-primary w-full text-sm"
          disabled={pending}
        >
          {pending ? "…" : "Passwort speichern"}
        </button>
      </form>

      <div className="space-y-2 border-t border-[var(--border)] pt-3">
        <p className="text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">
          Reset-Link erzeugen
        </p>
        <p className="text-xs text-[var(--muted)]">
          Link an die Person schicken — sie setzt das Passwort selbst.
        </p>
        <button
          type="button"
          className="btn btn-ghost w-full text-sm"
          disabled={pending}
          onClick={onCreateLink}
        >
          {pending ? "…" : "Link erzeugen"}
        </button>
        {resetUrl && (
          <div className="space-y-1.5">
            <code className="block break-all rounded-lg bg-black/[0.04] px-2 py-1.5 text-[0.65rem] text-[var(--fg)]">
              {resetUrl}
            </code>
            <button
              type="button"
              className="btn btn-accent w-full text-sm"
              onClick={copyLink}
            >
              {copied ? "Kopiert" : "Link kopieren"}
            </button>
          </div>
        )}
      </div>

      {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
      {success && (
        <p className="rounded-lg bg-[var(--highlight)] px-2 py-1.5 text-xs font-semibold">
          {success}
        </p>
      )}
    </div>
  );
}
