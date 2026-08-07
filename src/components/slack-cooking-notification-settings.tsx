"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateSlackCookingNotificationSettings } from "@/lib/actions";

export function SlackCookingNotificationSettings({
  weeklyEnabled,
  monthlyEnabled,
  webhookConfigured,
}: {
  weeklyEnabled: boolean;
  monthlyEnabled: boolean;
  webhookConfigured: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [weekly, setWeekly] = useState(weeklyEnabled);
  const [monthly, setMonthly] = useState(monthlyEnabled);

  function save(nextWeekly: boolean, nextMonthly: boolean) {
    setError(null);
    setWeekly(nextWeekly);
    setMonthly(nextMonthly);
    const fd = new FormData();
    fd.set("slackCookingWeeklyEnabled", nextWeekly ? "true" : "false");
    fd.set("slackCookingMonthlyEnabled", nextMonthly ? "true" : "false");
    startTransition(async () => {
      const result = await updateSlackCookingNotificationSettings(fd);
      if (result && "error" in result && result.error) {
        setError(String(result.error));
        setWeekly(weeklyEnabled);
        setMonthly(monthlyEnabled);
        return;
      }
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
          Nachrichten gehen in den konfigurierten Slack-Kanal (Incoming
          Webhook). Standardmässig aus — nur bei Bedarf einschalten.
        </p>
      </div>

      {!webhookConfigured && (
        <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          <span className="font-semibold">Webhook fehlt:</span>{" "}
          <code className="text-xs">SLACK_WEBHOOK_URL</code> ist nicht gesetzt.
          Toggles speichern sich, aber es wird nichts gesendet.
        </p>
      )}

      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--border)] px-3 py-3">
        <input
          type="checkbox"
          className="mt-1"
          checked={weekly}
          disabled={pending}
          onChange={(e) => save(e.target.checked, monthly)}
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

      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--border)] px-3 py-3">
        <input
          type="checkbox"
          className="mt-1"
          checked={monthly}
          disabled={pending}
          onChange={(e) => save(weekly, e.target.checked)}
        />
        <span>
          <span className="font-semibold">
            Monatlicher Eintrag-Reminder (letzte Woche)
          </span>
          <span className="mt-0.5 block text-sm text-[var(--muted)]">
            Am Montag der letzten Monatswoche: Bitte Kochtage für den Folgemonat
            eintragen
          </span>
        </span>
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </section>
  );
}
