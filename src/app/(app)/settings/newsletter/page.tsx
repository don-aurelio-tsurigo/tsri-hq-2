import { NewsletterBlockSettings } from "@/components/newsletter-block-settings";
import { NewsletterTypeManager } from "@/components/newsletter-type-manager";
import {
  ensureDefaultNewsletterTypes,
  getNewsletterCalendarSettings,
  listNewsletterTypes,
} from "@/lib/newsletter";
import { requireAdmin } from "@/lib/session";

export default async function NewsletterSettingsPage() {
  const { membership } = await requireAdmin();
  await ensureDefaultNewsletterTypes(membership.organizationId);

  const [types, calendarSettings] = await Promise.all([
    listNewsletterTypes(membership.organizationId),
    getNewsletterCalendarSettings(membership.organizationId),
  ]);

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm font-semibold tracking-wide text-[var(--accent)] uppercase">
          Einstellungen
        </p>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
          Newsletter Einstellungen
        </h1>
        <p className="mt-2 max-w-2xl text-[var(--muted)]">
          Typen, Rhythmus sowie Feiertage und Sommerpausen festlegen. Die
          Planung bleibt unter Newsletter-Plan in der Redaktion.
        </p>
      </header>

      <NewsletterTypeManager
        types={types.map((t) => ({
          id: t.id,
          name: t.name,
          weekdays: t.weekdays,
        }))}
      />

      <NewsletterBlockSettings
        hidePublicHolidays={calendarSettings.hidePublicHolidays}
        blockedRanges={calendarSettings.blockedRanges.map((r) => ({
          id: r.id,
          startKey: r.startDate.toISOString().slice(0, 10),
          endKey: r.endDate.toISOString().slice(0, 10),
          label: r.label,
        }))}
      />
    </div>
  );
}
