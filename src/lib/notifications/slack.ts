type SlackPostResult =
  | { ok: true; skipped?: boolean }
  | { ok: false; error: string };

/**
 * Resolve webhook URL: explicit org/notification URL wins, then env fallback.
 */
export function resolveSlackWebhookUrl(explicit?: string | null) {
  const fromExplicit = explicit?.trim();
  if (fromExplicit) return fromExplicit;
  return process.env.SLACK_WEBHOOK_URL?.trim() || null;
}

/**
 * Posts a plain-text message to a Slack Incoming Webhook.
 * Fail-open: callers should not abort domain work if this fails.
 */
export async function postToSlack(
  text: string,
  webhookUrl?: string | null,
): Promise<SlackPostResult> {
  const url = resolveSlackWebhookUrl(webhookUrl);
  if (!url) {
    console.warn("[slack] no webhook URL — skipping message");
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

export function isSlackWebhookConfigured(explicit?: string | null) {
  return Boolean(resolveSlackWebhookUrl(explicit));
}

const SLACK_HOOKS_PREFIX = "https://hooks.slack.com/";

/** Empty string clears; otherwise require a Slack Incoming Webhook URL. */
export function normalizeSlackWebhookInput(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true as const, value: null };
  if (!trimmed.startsWith(SLACK_HOOKS_PREFIX)) {
    return {
      ok: false as const,
      error:
        "Webhook-URL muss mit https://hooks.slack.com/ beginnen (Incoming Webhook).",
    };
  }
  try {
    // Validate URL shape without accepting arbitrary hosts.
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:" || parsed.hostname !== "hooks.slack.com") {
      return {
        ok: false as const,
        error: "Ungültige Slack-Webhook-URL.",
      };
    }
  } catch {
    return { ok: false as const, error: "Ungültige Slack-Webhook-URL." };
  }
  return { ok: true as const, value: trimmed };
}
