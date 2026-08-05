import { AppSidebar } from "@/components/app-sidebar";
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
  const [spaces, wikiPins] = await Promise.all([
    listVisibleSpaces(membership.organizationId, session.user.id),
    listPinnedWikiPages(membership.organizationId, 8).catch(() => []),
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
    <div className="flex min-h-screen">
      <Suspense
        fallback={
          <aside className="sticky top-0 h-svh w-64 shrink-0 bg-[var(--sidebar)]" aria-hidden />
        }
      >
        <AppSidebar
          userName={session.user.name}
          orgName={membership.organization.name}
          isAdmin={membership.role === "admin"}
          spacesBySlug={spacesBySlug}
          wikiPins={pins}
        />
      </Suspense>
      <main className="flex min-w-0 flex-1 flex-col">
        <div
          className="h-1.5 w-full shrink-0"
          style={{ background: "var(--gradient-blue)" }}
          aria-hidden
        />
        <div className="mx-auto w-full max-w-[1600px] flex-1 px-6 py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
