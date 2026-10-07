"use client";

import { useState, useTransition } from "react";
import { Copy, RefreshCw, Webhook } from "lucide-react";
import { useToast } from "@/components/toast";
import { regenerateFinanceWebhookToken } from "@/lib/actions/finance";

const EXAMPLE = `{
  "id": "{{Deal ID}}",
  "title": "{{Deal Title}}",
  "value": "{{Deal Value}}",
  "organisation": "{{Organization Name}}",
  "org_id": "{{Organization ID}}",
  "owner": "{{Owner Name}}",
  "bexio_url": "{{Bexio Auftrag URL}}",
  "start_month": "2027-01",
  "months": 12,
  "category": "Tipp des Tages / Newsletter"
}`;

export function FinanceWebhookPanel({
  url,
  initialToken,
}: {
  url: string;
  initialToken: string | null;
}) {
  const { showToast } = useToast();
  const [token, setToken] = useState(initialToken);
  const [revealed, setRevealed] = useState(false);
  const [pending, startTransition] = useTransition();

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      showToast({ message: `${label} kopiert.` });
    } catch {
      showToast({ message: "Kopieren nicht möglich." });
    }
  }

  function regenerate() {
    if (
      token &&
      !window.confirm(
        "Neuen Token erzeugen? Der alte funktioniert danach nicht mehr – der Zap muss angepasst werden.",
      )
    ) {
      return;
    }
    startTransition(async () => {
      const { token: next } = await regenerateFinanceWebhookToken();
      setToken(next);
      setRevealed(true);
      showToast({ message: "Neuer Token erzeugt." });
    });
  }

  return (
    <details className="card group p-5">
      <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold">
        <Webhook className="size-4 text-[var(--accent)]" />
        Zapier-Verbindung (Pipedrive → Deals)
        <span className="ml-auto text-xs font-medium text-[var(--muted)]">
          {token ? "aktiv" : "noch nicht eingerichtet"}
        </span>
      </summary>

      <div className="mt-4 space-y-4 text-sm">
        <p className="text-[var(--muted)]">
          Im bestehenden Zap (Pipedrive → Bexio) einen zusätzlichen Schritt <b>Webhooks by Zapier → POST</b>{" "}
          anlegen. Payload Type <b>JSON</b>, Header <code>Authorization: Bearer &lt;Token&gt;</code>. Gleiche
          Deal-ID aktualisiert den bestehenden Deal statt einen neuen anzulegen.
        </p>

        <div className="space-y-1">
          <p className="text-xs font-bold text-[var(--muted)] uppercase">URL</p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-[var(--panel-muted)] px-2 py-1.5">{url}</code>
            <button type="button" className="btn btn-ghost p-2" onClick={() => copy(url, "URL")} aria-label="URL kopieren">
              <Copy className="size-4" />
            </button>
          </div>
        </div>

        <div className="space-y-1">
          <p className="text-xs font-bold text-[var(--muted)] uppercase">Token</p>
          {token ? (
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded bg-[var(--panel-muted)] px-2 py-1.5">
                {revealed ? token : `${token.slice(0, 8)}${"•".repeat(24)}`}
              </code>
              <button type="button" className="btn btn-ghost px-2 py-1.5 text-xs" onClick={() => setRevealed((v) => !v)}>
                {revealed ? "Verbergen" : "Anzeigen"}
              </button>
              <button type="button" className="btn btn-ghost p-2" onClick={() => copy(token, "Token")} aria-label="Token kopieren">
                <Copy className="size-4" />
              </button>
            </div>
          ) : (
            <p className="text-[var(--muted)]">Noch kein Token – erst erzeugen, dann im Zap eintragen.</p>
          )}
          <button
            type="button"
            className="btn btn-ghost mt-1 inline-flex items-center gap-1.5 px-2 py-1 text-xs"
            onClick={regenerate}
            disabled={pending}
          >
            <RefreshCw className="size-3.5" />
            {token ? "Neuen Token erzeugen" : "Token erzeugen"}
          </button>
        </div>

        <div className="space-y-1">
          <p className="text-xs font-bold text-[var(--muted)] uppercase">Beispiel-Body</p>
          <pre className="overflow-x-auto rounded bg-[var(--panel-muted)] p-3 text-xs">{EXAMPLE}</pre>
          <p className="text-xs text-[var(--muted)]">
            Pflicht: <code>id</code>, <code>title</code>, <code>value</code>. <code>org_id</code> ordnet
            die Organisation auch nach Umbenennungen in Pipedrive richtig zu. Optional helfen{" "}
            <code>start_month</code>, <code>months</code> und <code>category</code> (Name wie in der Übersicht),
            den Aufteilen-Dialog vorzufüllen.
          </p>
        </div>
      </div>
    </details>
  );
}
