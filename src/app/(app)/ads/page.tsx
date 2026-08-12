import { AdsAdmin } from "@/components/ads-admin";
import { AdSlot } from "@/components/ad-slot";
import { listAdCampaigns } from "@/lib/ads";
import { requireAdmin } from "@/lib/session";

export default async function AdsPage() {
  await requireAdmin();
  const campaigns = await listAdCampaigns();

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header>
        <p className="text-sm font-semibold tracking-wide text-[var(--accent)] uppercase">
          Admin
        </p>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
          Werbung
        </h1>
        <p className="mt-2 max-w-2xl text-[var(--muted)]">
          Direct-Sold-Kampagnen für den Slot <code>article-top</code>. Auslieferung
          per Zufall unter aktiven Kampagnen; Tracking nur Impressions und Klicks.
        </p>
      </header>

      <AdsAdmin campaigns={campaigns} />

      <section className="card space-y-3 p-5">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
          Extern einbinden
        </h2>
        <p className="text-sm text-[var(--muted)]">
          Auf tsri.ch (oder einer anderen freigegebenen Origin) dieses Markup
          einfügen. Das Script lädt Creative + Tracking von dieser HQ-Instanz.
        </p>
        <pre className="overflow-x-auto rounded-lg bg-[var(--panel-muted)] p-3 text-xs leading-relaxed">
          {`<div data-hq-ad="article-top"></div>
<script async src="${process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "https://tsri-hub.online"}/ads/embed.js"></script>`}
        </pre>
      </section>

      <section className="space-y-3">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
          Live-Vorschau
        </h2>
        <p className="text-sm text-[var(--muted)]">
          So rendert <code>&lt;AdSlot /&gt;</code> (leer wenn keine aktive Kampagne).
        </p>
        <AdSlot />
      </section>
    </div>
  );
}
