"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Menu } from "lucide-react";
import { AppSidebar } from "@/components/app-sidebar";
import { ToastProvider } from "@/components/toast";

type NavSpace = {
  id: string;
  name: string;
  slug: string;
};

type WikiPin = {
  title: string;
  slug: string;
  spaceId: string;
};

type NavProject = {
  id: string;
  name: string;
};

export function AppShell({
  userName,
  orgName,
  isAdmin,
  canFinance,
  canAds,
  spacesBySlug,
  wikiPins,
  navProjects = [],
  children,
}: {
  userName: string;
  orgName: string;
  isAdmin: boolean;
  canFinance: boolean;
  canAds: boolean;
  spacesBySlug: Record<string, NavSpace | undefined>;
  wikiPins: WikiPin[];
  navProjects?: NavProject[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname, searchParams]);

  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  useEffect(() => {
    if (!mobileOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMobileOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  return (
    <ToastProvider>
      <div className="flex min-h-screen">
        <header
          className="fixed inset-x-0 top-0 z-40 flex h-14 items-center gap-3 px-3 text-[var(--fg)] md:hidden"
          style={{ background: "var(--gradient-blue)" }}
        >
          <button
            type="button"
            className="inline-flex size-10 items-center justify-center rounded-xl bg-black/10 hover:bg-black/15"
            aria-label="Menü öffnen"
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="size-5" strokeWidth={1.75} />
          </button>
          <Link href="/home" className="min-w-0" aria-label="Zur Startseite">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/tsuri-logo.png"
              alt="Tsüri HQ"
              className="h-7 w-auto max-w-[9rem] object-contain object-left"
            />
          </Link>
          <p className="ml-auto truncate text-xs font-bold opacity-90">{orgName}</p>
        </header>

        {mobileOpen && (
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/45 md:hidden"
            aria-label="Menü schliessen"
            onClick={() => setMobileOpen(false)}
          />
        )}

        <AppSidebar
          userName={userName}
          orgName={orgName}
          isAdmin={isAdmin}
          canFinance={canFinance}
          canAds={canAds}
          spacesBySlug={spacesBySlug}
          wikiPins={wikiPins}
          navProjects={navProjects}
          mobileOpen={mobileOpen}
          onMobileClose={() => setMobileOpen(false)}
        />

        <main className="flex min-w-0 flex-1 flex-col pt-14 md:pt-0">
          <div
            className="hidden h-1.5 w-full shrink-0 md:block"
            style={{ background: "var(--gradient-blue)" }}
            aria-hidden
          />
          <div className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6 md:px-6 md:py-8">
            {children}
          </div>
        </main>
      </div>
    </ToastProvider>
  );
}
