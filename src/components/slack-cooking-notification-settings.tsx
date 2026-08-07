"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateSlackCookingNotificationSettings } from "@/lib/actions";

export function SlackCookingNotificationSettings({
  weeklyEnabled,
  monthlyEnabled,
  weeklyWebhookUrl,
  monthlyWebhookUrl,
  envWebhookConfigured,
}: {
  weeklyEnabled: boolean;
  monthlyEnabled: boolean;
  weeklyWebhookUrl: string;
  monthlyWebhookUrl: string;
  envWebhookConfigured: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [weekly, setWeekly] = useState(weeklyEnabled);
  const [monthly, setMonthly] = useState(monthlyEnabled);
  const [weeklyUrl, setWeeklyUrl] = useState(weeklyWebhookUrl);
  const [monthlyUrl, setMonthlyUrl] = useState(monthlyWebhookUrl);

  function save() {
    setError(null);
    setSaved(false);
    const fd = new FormData();
    fd.set("slackCookingWeeklyEnabled", weekly ? "true" : "false");
    fd.set("slackCookingMonthlyEnabled", monthly ? "true" : "false");
    fd.set("slackCookingWeeklyWebhookUrl", weeklyUrl);
    fd.set("slackCookingMonthlyWebhookUrl", monthlyUrl);
    startTransition(async () => {
      const result = await updateSlackCookingNotificationSettings(fd);
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
          Slack — Kochplan
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Pro Notification eigenen Incoming-Webhook eintragen (verschiedene
          Kanäle möglich). Standardmässig aus.
        </p>
      </div>

      <div className="space-y-3 rounded-xl border border-[var(--border)] px-3 py-3">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            className="mt-1"
            checked={weekly}
            disabled={pending}
            onChange={(e) => setWeekly(e.target.checked)}
          />
          <span>
            <span className="font-semibold">
              Wöchentlicher Kochplan-Digest (Montag)
            </span>
            <span className="mt-0.5 block text-sm text-[var(--muted)]">
              Montag ab 08:00 (Europe/Zurich): Wer kocht Di–Fr, inklusive offene
              Tage
            </span>
          </span>
        </label>
        <label className="field text-xs font-semibold text-[var(--muted)]">
          Slack-Webhook-URL
          <input
            type="url"
            value={weeklyUrl}
            disabled={pending}
            onChange={(e) => setWeeklyUrl(e.target.value)}
            placeholder="https://hooks.slack.com/services/…"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        {weekly && !weeklyUrl.trim() && !envWebhookConfigured && (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Kein Webhook gesetzt — bei aktivem Toggle wird nichts gesendet.
          </p>
        )}
      </div>

      <div className="space-y-3 rounded-xl border border-[var(--border)] px-3 py-3">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            className="mt-1"
            checked={monthly}
            disabled={pending}
            onChange={(e) => setMonthly(e.target.checked)}
          />
          <span>
            <span className="font-semibold">
              Monatlicher Eintrag-Reminder (letzte Woche)
            </span>
            <span className="mt-0.5 block text-sm text-[var(--muted)]">
              Am Montag der letzten Monatswoche: Bitte Kochtage für den
              Folgemonat eintragen
            </span>
          </span>
        </label>
        <label className="field text-xs font-semibold text-[var(--muted)]">
          Slack-Webhook-URL
          <input
            type="url"
            value={monthlyUrl}
            disabled={pending}
            onChange={(e) => setMonthlyUrl(e.target.value)}
            placeholder="https://hooks.slack.com/services/…"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        {monthly && !monthlyUrl.trim() && !envWebhookConfigured && (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Kein Webhook gesetzt — bei aktivem Toggle wird nichts gesendet.
          </p>
        )}
      </div>

      {envWebhookConfigured && (
        <p className="text-xs text-[var(--muted)]">
          Fallback: Wenn ein Feld leer bleibt, wird{" "}
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
