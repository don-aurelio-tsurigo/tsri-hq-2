import { AppShell } from "@/components/app-shell";
import { listNavProjects } from "@/lib/projects";
import { canAccessCivicMedia, hasCapability } from "@/lib/permissions";
import { requireMembership } from "@/lib/session";
import { listVisibleSpaces } from "@/lib/spaces";
import { listPinnedWikiPages } from "@/lib/wiki";
import { Suspense } from "react";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { session, membership } = await requireMembership();
  const [spaces, wikiPins, navProjects] = await Promise.all([
    listVisibleSpaces(membership.organizationId, session.user.id),
    listPinnedWikiPages(membership.organizationId, 8).catch(() => []),
    listNavProjects(membership.organizationId).catch(() => []),
  ]);

  const spacesBySlug: Record<
    string,
    { id: string; name: string; slug: string } | undefined
  > = {};
  for (const space of spaces) {
    if (space.type === "team") {
      spacesBySlug[space.slug] = {
        id: space.id,
        name: space.name,
        slug: space.slug,
      };
    }
  }

  const pins = wikiPins.map((p) => ({
    title: p.title,
    slug: p.slug,
    spaceId: p.spaceId,
  }));

  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen">
          <aside
            className="hidden h-svh w-64 shrink-0 bg-[var(--sidebar)] md:block"
            aria-hidden
          />
          <main className="min-w-0 flex-1 px-4 py-6 md:px-6 md:py-8">
            {children}
          </main>
        </div>
      }
    >
      <AppShell
        userName={session.user.name}
        orgName={membership.organization.name}
        isAdmin={membership.role === "admin"}
        canFinance={hasCapability(membership, "finance")}
        canAds={canAccessCivicMedia(membership)}
        spacesBySlug={spacesBySlug}
        wikiPins={pins}
        navProjects={navProjects}
      >
        {children}
      </AppShell>
    </Suspense>
  );
}
