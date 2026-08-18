import { AdsAdmin } from "@/components/ads-admin";
import { AdSlot } from "@/components/ad-slot";
import { listAdCampaigns } from "@/lib/ads";
import { requireCivicMediaAccess } from "@/lib/session";

export default async function AdsPage() {
  await requireCivicMediaAccess();
  const campaigns = await listAdCampaigns();

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
          Werbung
        </h1>
      </header>

      <AdsAdmin campaigns={campaigns} />

      <section className="card space-y-3 p-5">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
          Extern einbinden
        </h2>
        <p className="text-sm text-[var(--muted)]">
          Auf tsri.ch (oder einer anderen freigegebenen Origin) eines der
          Snippets einfügen. Creative + Tracking kommen von dieser HQ-Instanz.
        </p>
        <div className="space-y-2">
          <p className="text-sm font-semibold">Script-Embed</p>
          <pre className="overflow-x-auto rounded-lg bg-[var(--panel-muted)] p-3 text-xs leading-relaxed">
            {`<div data-hq-ad="article-top"></div>
<script async src="${process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "https://tsri-hub.online"}/ads/embed.js"></script>`}
          </pre>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-semibold">iframe-Embed</p>
          <p className="text-sm text-[var(--muted)]">
            Fallback, falls der Editor keine <code>&lt;script&gt;</code>-Tags
            erlaubt. Höhe anpassen (ohne Angabe oft nur ~150px sichtbar).
          </p>
          <pre className="overflow-x-auto rounded-lg bg-[var(--panel-muted)] p-3 text-xs leading-relaxed">
            {`<iframe
  src="${process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "https://tsri-hub.online"}/ads/frame?slot=article-top"
  style="width:100%;max-width:582px;height:400px;border:0;overflow:hidden"
  title="Anzeige"
></iframe>`}
          </pre>
        </div>
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
