type SlackPostResult =
  | { ok: true; skipped?: boolean }
  | { ok: false; error: string };

/**
 * Posts a plain-text message to the configured Slack Incoming Webhook.
 * Fail-open: callers should not abort domain work if this fails.
 */
export async function postToSlack(text: string): Promise<SlackPostResult> {
  const url = process.env.SLACK_WEBHOOK_URL?.trim();
  if (!url) {
    console.warn("[slack] SLACK_WEBHOOK_URL unset — skipping message");
    return { ok: true, skipped: true };
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const error = `Slack webhook HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`;
      console.error("[slack]", error);
      return { ok: false, error };
    }
    return { ok: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error("[slack] post failed", err);
    return { ok: false, error };
  }
}

export function isSlackWebhookConfigured() {
  return Boolean(process.env.SLACK_WEBHOOK_URL?.trim());
}
