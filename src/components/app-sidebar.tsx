"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  CalendarDays,
  CheckSquare,
  ChefHat,
  ClipboardList,
  Clock,
  FolderKanban,
  Home,
  Info,
  LogOut,
  Mail,
  Newspaper,
  Pin,
  Rss,
  Settings2,
  Users,
  X,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";

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

function NavLink({
  href,
  active,
  icon: Icon,
  children,
  className,
  onNavigate,
}: {
  href: string;
  active: boolean;
  icon: LucideIcon;
  children: ReactNode;
  className?: string;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={[
        "flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold transition-colors",
        active
          ? "bg-[var(--highlight)] !text-[#0a0a0a]"
          : "text-[var(--sidebar-muted)] hover:bg-white/10 hover:text-white",
        className ?? "",
      ].join(" ")}
    >
      <Icon
        aria-hidden
        className={[
          "size-4 shrink-0",
          active ? "opacity-90" : "opacity-70",
        ].join(" ")}
        strokeWidth={1.75}
      />
      <span className="min-w-0 truncate">{children}</span>
    </Link>
  );
}

export function AppSidebar({
  userName,
  orgName,
  isAdmin,
  spacesBySlug,
  wikiPins = [],
  mobileOpen = false,
  onMobileClose,
}: {
  userName: string;
  orgName: string;
  isAdmin: boolean;
  spacesBySlug: Record<string, NavSpace | undefined>;
  wikiPins?: WikiPin[];
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  function spaceHref(slug: string) {
    const space = spacesBySlug[slug];
    return space ? `/spaces/${space.id}` : "#";
  }

  function spaceActive(slug: string) {
    const space = spacesBySlug[slug];
    return !!space && pathname === `/spaces/${space.id}`;
  }

  function wikiPageActive(slug: string) {
    const space = spacesBySlug.wiki;
    if (!space || pathname !== `/spaces/${space.id}`) return false;
    return searchParams.get("page") === slug;
  }

  async function signOut() {
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside
      id="app-sidebar"
      className={[
        "flex h-svh w-64 shrink-0 flex-col bg-[var(--sidebar)] text-[var(--sidebar-fg)]",
        "fixed inset-y-0 left-0 z-50 transition-transform duration-200 ease-out",
        "md:sticky md:top-0 md:z-auto md:translate-x-0 md:transition-none",
        mobileOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full md:translate-x-0",
      ].join(" ")}
    >
      <div
        className="shrink-0 border-b border-black/10 px-4 py-5 text-[var(--fg)]"
        style={{ background: "var(--gradient-blue)" }}
      >
        <div className="flex items-start justify-between gap-2">
          <Link
            href="/home"
            className="min-w-0"
            onClick={onMobileClose}
            aria-label="Zur Startseite"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/tsuri-logo.png"
              alt="Tsüri HQ"
              className="h-9 w-auto max-w-[11rem] object-contain object-left"
            />
          </Link>
          {onMobileClose && (
            <button
              type="button"
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-black/10 hover:bg-black/15 md:hidden"
              aria-label="Menü schliessen"
              onClick={onMobileClose}
            >
              <X className="size-5" strokeWidth={1.75} />
            </button>
          )}
        </div>
        <p className="mt-3 truncate text-sm font-bold">{orgName}</p>
        <p className="mt-0.5 truncate text-xs font-medium opacity-80">
          {userName}
        </p>
      </div>

      <nav className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-3 py-4">
        <div className="flex flex-col gap-0.5">
          <NavLink
            href="/home"
            active={pathname === "/home" || pathname === "/inbox"}
            icon={Home}
            onNavigate={onMobileClose}
          >
            Home
          </NavLink>
        </div>

        <div>
          <p className="mb-2 px-3 text-[0.7rem] font-extrabold tracking-wider text-[var(--sidebar-muted)] uppercase">
            Redaktion
          </p>
          <div className="flex flex-col gap-0.5">
            <NavLink
              href={spaceHref("redaktion")}
              active={spaceActive("redaktion")}
              icon={Newspaper}
              onNavigate={onMobileClose}
            >
              Artikel
            </NavLink>
            <NavLink
              href={spaceHref("quellen")}
              active={spaceActive("quellen")}
              icon={Rss}
              onNavigate={onMobileClose}
            >
              Newsfeed
            </NavLink>
            <NavLink
              href="/newsletter"
              active={
                pathname === "/newsletter" ||
                pathname.startsWith("/newsletter/")
              }
              icon={Mail}
              onNavigate={onMobileClose}
            >
              Newsletter
            </NavLink>
          </div>
        </div>

        <div>
          <p className="mb-2 px-3 text-[0.7rem] font-extrabold tracking-wider text-[var(--sidebar-muted)] uppercase">
            Civic Media
          </p>
          <div className="flex flex-col gap-0.5">
            <NavLink
              href="/projects"
              active={
                pathname === "/projects" ||
                pathname.startsWith("/projects/")
              }
              icon={FolderKanban}
              onNavigate={onMobileClose}
            >
              Projekte
            </NavLink>
          </div>
        </div>

        <div>
          <p className="mb-2 px-3 text-[0.7rem] font-extrabold tracking-wider text-[var(--sidebar-muted)] uppercase">
            Privat
          </p>
          <div className="flex flex-col gap-0.5">
            <NavLink
              href="/tasks"
              active={
                pathname === "/tasks" || pathname.startsWith("/tasks/")
              }
              icon={CheckSquare}
              onNavigate={onMobileClose}
            >
              Meine Tasks
            </NavLink>
            <NavLink
              href="/hours"
              active={
                pathname === "/hours" || pathname.startsWith("/hours/")
              }
              icon={Clock}
              onNavigate={onMobileClose}
            >
              Arbeitszeit
            </NavLink>
          </div>
        </div>

        <div>
          <p className="mb-2 px-3 text-[0.7rem] font-extrabold tracking-wider text-[var(--sidebar-muted)] uppercase">
            Team
          </p>
          <div className="flex flex-col gap-0.5">
            <NavLink
              href={spaceHref("kochplan")}
              active={spaceActive("kochplan")}
              icon={ChefHat}
              onNavigate={onMobileClose}
            >
              Kochplan
            </NavLink>
            <NavLink
              href={spaceHref("ferienplan")}
              active={spaceActive("ferienplan")}
              icon={CalendarDays}
              onNavigate={onMobileClose}
            >
              Ferienplan
            </NavLink>
            <NavLink
              href={spaceHref("aemliplan")}
              active={spaceActive("aemliplan")}
              icon={ClipboardList}
              onNavigate={onMobileClose}
            >
              Ämtliplan
            </NavLink>
            <NavLink
              href={spaceHref("team-infos")}
              active={spaceActive("team-infos")}
              icon={Info}
              onNavigate={onMobileClose}
            >
              Teaminfos
            </NavLink>
            <NavLink
              href={spaceHref("wiki")}
              active={spaceActive("wiki") && !searchParams.get("page")}
              icon={BookOpen}
              onNavigate={onMobileClose}
            >
              Wiki
            </NavLink>
            {wikiPins.map((pin) => (
              <NavLink
                key={`${pin.spaceId}-${pin.slug}`}
                href={`/spaces/${pin.spaceId}?page=${encodeURIComponent(pin.slug)}`}
                active={wikiPageActive(pin.slug)}
                icon={Pin}
                className="ml-3 !py-1.5 text-xs"
                onNavigate={onMobileClose}
              >
                {pin.title}
              </NavLink>
            ))}
          </div>
        </div>

        {isAdmin && (
          <div>
            <p className="mb-2 px-3 text-[0.7rem] font-extrabold tracking-wider text-[var(--sidebar-muted)] uppercase">
              Admin
            </p>
            <div className="flex flex-col gap-0.5">
              <NavLink
                href="/settings/members"
                active={
                  pathname === "/settings/members" ||
                  pathname.startsWith("/settings/members/")
                }
                icon={Users}
                onNavigate={onMobileClose}
              >
                Teamverwaltung
              </NavLink>
              <NavLink
                href="/settings/hours"
                active={
                  pathname === "/settings/hours" ||
                  pathname.startsWith("/settings/hours/")
                }
                icon={Clock}
                onNavigate={onMobileClose}
              >
                Teamarbeitszeit
              </NavLink>
              <NavLink
                href="/settings/newsletter"
                active={
                  pathname === "/settings/newsletter" ||
                  pathname.startsWith("/settings/newsletter/")
                }
                icon={Settings2}
                onNavigate={onMobileClose}
              >
                Newslettereinstellungen
              </NavLink>
            </div>
          </div>
        )}
      </nav>

      <div className="shrink-0 border-t border-white/10 p-3">
        <button
          type="button"
          onClick={signOut}
          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-semibold text-[var(--sidebar-muted)] hover:bg-white/10 hover:text-white"
        >
          <LogOut
            aria-hidden
            className="size-4 shrink-0 opacity-70"
            strokeWidth={1.75}
          />
          Abmelden
        </button>
      </div>
    </aside>
  );
}
