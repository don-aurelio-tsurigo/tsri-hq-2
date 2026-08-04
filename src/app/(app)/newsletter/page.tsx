import { NewsletterDirectory } from "@/components/newsletter-directory";
import { prisma } from "@/lib/db";
import {
  ensureDefaultNewsletterTypes,
  listNewsletterCampaigns,
  listNewsletterTypes,
  type NewsletterCampaignStatusValue,
  type NewsletterFrequencyValue,
} from "@/lib/newsletter";
import { requireMembership } from "@/lib/session";

export default async function NewsletterPage() {
  const { session, membership } = await requireMembership();
  await ensureDefaultNewsletterTypes(membership.organizationId);

  const [types, campaigns, members] = await Promise.all([
    listNewsletterTypes(membership.organizationId),
    listNewsletterCampaigns(membership.organizationId),
    prisma.membership.findMany({
      where: { organizationId: membership.organizationId },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { user: { name: "asc" } },
    }),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <p className="text-sm font-semibold tracking-wide text-[var(--accent)] uppercase">
          Redaktion
        </p>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
          Newsletterkampagnen
        </h1>
        <p className="mt-2 max-w-2xl text-[var(--muted)]">
          Typen mit Erscheinungstagen planen, Ausgaben erfassen und ausgefallene
          Newsletter (z. B. Sommerpause) markieren.
        </p>
      </header>

      <NewsletterDirectory
        types={types.map((t) => ({
          id: t.id,
          name: t.name,
          frequency: t.frequency as NewsletterFrequencyValue,
          weekdays: t.weekdays,
        }))}
        campaigns={campaigns.map((c) => ({
          id: c.id,
          date: c.date.toISOString().slice(0, 10),
          campaignUrl: c.campaignUrl,
          status: c.status as NewsletterCampaignStatusValue,
          note: c.note,
          type: {
            id: c.type.id,
            name: c.type.name,
            frequency: c.type.frequency as NewsletterFrequencyValue,
            weekdays: c.type.weekdays,
          },
          author: c.author,
        }))}
        members={members.map((m) => m.user)}
        currentUserId={session.user.id}
      />
    </div>
  );
}
