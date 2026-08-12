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

      <section className="space-y-3">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
          Live-Vorschau
        </h2>
        <p className="text-sm text-[var(--muted)]">
          So rendert <code>&lt;AdSlot /&gt;</code> (leer wenn keine aktive Kampagne).
        </p>
        <div className="card overflow-hidden p-0">
          <AdSlot />
        </div>
      </section>
    </div>
  );
}
