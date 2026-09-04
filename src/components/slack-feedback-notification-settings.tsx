"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateSlackFeedbackNotificationSettings } from "@/lib/actions";

export function SlackFeedbackNotificationSettings({
  enabled,
  webhookUrl,
  envWebhookConfigured,
}: {
  enabled: boolean;
  webhookUrl: string;
  envWebhookConfigured: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [on, setOn] = useState(enabled);
  const [url, setUrl] = useState(webhookUrl);

  function save() {
    setError(null);
    setSaved(false);
    const fd = new FormData();
    fd.set("slackFeedbackDigestEnabled", on ? "true" : "false");
    fd.set("slackFeedbackDigestWebhookUrl", url);
    startTransition(async () => {
      const result = await updateSlackFeedbackNotificationSettings(fd);
      if (result && "error" in result && result.error) {
        setError(String(result.error));
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <section className="card space-y-5 p-4">
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
          Slack — Newsletter-Feedback
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Täglicher Digest der bestätigten Stimmen und Kommentare. Standardmässig
          aus.
        </p>
      </div>

      <div className="space-y-3 rounded-xl border border-[var(--border)] px-3 py-3">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            className="mt-1"
            checked={on}
            disabled={pending}
            onChange={(e) => setOn(e.target.checked)}
          />
          <span>
            <span className="font-semibold">
              Feedback vom Vortag (Montag–Freitag)
            </span>
            <span className="mt-0.5 block text-sm text-[var(--muted)]">
              Ab 08:00 (Europe/Zurich): Stimmen und Kommentare des Vortags. Am
              Montag die vom Freitag.
            </span>
          </span>
        </label>
        <label className="field text-xs font-semibold text-[var(--muted)]">
          Slack-Webhook-URL
          <input
            type="url"
            value={url}
            disabled={pending}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://hooks.slack.com/services/…"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        {on && !url.trim() && !envWebhookConfigured && (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Kein Webhook gesetzt — bei aktivem Toggle wird nichts gesendet.
          </p>
        )}
      </div>

      {envWebhookConfigured && (
        <p className="text-xs text-[var(--muted)]">
          Fallback: Wenn das Feld leer bleibt, wird{" "}
          <code className="text-[0.7rem]">SLACK_WEBHOOK_URL</code> aus der Env
          verwendet.
        </p>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {saved && !error && (
        <p className="text-sm text-[var(--muted)]">Gespeichert.</p>
      )}

      <div>
        <button
          type="button"
          className="btn btn-primary"
          disabled={pending}
          onClick={save}
        >
          {pending ? "Speichern…" : "Speichern"}
        </button>
      </div>
    </section>
  );
}
