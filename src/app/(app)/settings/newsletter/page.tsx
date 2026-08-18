import { NewsletterBlockSettings } from "@/components/newsletter-block-settings";
import { NewsletterTypeManager } from "@/components/newsletter-type-manager";
import {
  ensureDefaultNewsletterTypes,
  getNewsletterCalendarSettings,
  listNewsletterTypes,
} from "@/lib/newsletter";
import { requireEditorialLead } from "@/lib/session";

export default async function NewsletterSettingsPage() {
  const { membership } = await requireEditorialLead();
  await ensureDefaultNewsletterTypes(membership.organizationId);

  const [types, calendarSettings] = await Promise.all([
    listNewsletterTypes(membership.organizationId),
    getNewsletterCalendarSettings(membership.organizationId),
  ]);

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm font-semibold tracking-wide text-[var(--accent)] uppercase">
          Redaktion
        </p>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
          Newsletter Einstellungen
        </h1>
      </header>

      <NewsletterTypeManager
        types={types.map((t) => ({
          id: t.id,
          name: t.name,
          weekdays: t.weekdays,
          requiresWordle: t.requiresWordle,
        }))}
      />

      <NewsletterBlockSettings
        hidePublicHolidays={calendarSettings.hidePublicHolidays}
        types={types.map((t) => ({ id: t.id, name: t.name }))}
        blockedRanges={calendarSettings.blockedRanges.map((r) => ({
          id: r.id,
          newsletterTypeId: r.newsletterTypeId,
          typeName: r.newsletterType.name,
          startKey: r.startDate.toISOString().slice(0, 10),
          endKey: r.endDate.toISOString().slice(0, 10),
          label: r.label,
        }))}
      />
    </div>
  );
}
