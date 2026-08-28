"use client";

import { Children, cloneElement, isValidElement, useState, type ReactElement, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  Archive,
  BookOpen,
  CalendarDays,
  CheckSquare,
  ChefHat,
  ChevronDown,
  ClipboardList,
  Clock,
  FolderKanban,
  Home,
  Image,
  ImagePlus,
  Images,
  Info,
  LogOut,
  Mail,
  Megaphone,
  MessageCircle,
  Bell,
  Newspaper,
  Pin,
  Rss,
  Settings2,
  Trash2,
  Upload,
  Users,
  Wallet,
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

type NavProject = {
  id: string;
  name: string;
};

type NavTaskPin = {
  kind: "list" | "project";
  id: string;
  name: string;
};

type NavSectionId = "redaktion" | "fotos" | "tasks" | "projekte" | "team" | "admin";

function NavLink({
  href,
  active,
  icon: Icon,
  children,
  className,
  onNavigate,
  nested = false,
}: {
  href: string;
  active: boolean;
  icon: LucideIcon;
  children: ReactNode;
  className?: string;
  onNavigate?: () => void;
  nested?: boolean;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={[
        "flex items-center gap-2.5 rounded-xl transition-colors",
        nested
          ? "px-3 py-1.5 text-[0.8125rem] font-medium"
          : "px-3 py-2 text-sm font-bold tracking-wider uppercase",
        active
          ? "bg-[var(--highlight)] !text-[#0a0a0a]"
          : nested
            ? "text-[var(--sidebar-muted)] hover:bg-white/10 hover:text-white"
            : "text-white hover:bg-white/10",
        className ?? "",
      ].join(" ")}
    >
      <Icon
        aria-hidden
        className={[
          "shrink-0",
          nested ? "size-3.5" : "size-4",
          active ? "opacity-90" : nested ? "opacity-70" : "opacity-90",
        ].join(" ")}
        strokeWidth={1.75}
      />
      <span className="min-w-0 truncate">{children}</span>
    </Link>
  );
}

function NavTopLink({
  href,
  active,
  icon: Icon,
  children,
  onNavigate,
}: {
  href: string;
  active: boolean;
  icon: LucideIcon;
  children: ReactNode;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={[
        "flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-bold tracking-wider uppercase transition-colors",
        active
          ? "bg-[var(--highlight)] !text-[#0a0a0a]"
          : "text-white hover:bg-white/10",
      ].join(" ")}
    >
      <Icon
        aria-hidden
        className="size-4 shrink-0 opacity-90"
        strokeWidth={1.75}
      />
      <span className="min-w-0 truncate">{children}</span>
    </Link>
  );
}

function NavSection({
  title,
  icon: Icon,
  open,
  onToggle,
  children,
}: {
  title: string;
  icon: LucideIcon;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-bold tracking-wider text-white uppercase transition-colors hover:bg-white/10"
      >
        <Icon
          aria-hidden
          className="size-4 shrink-0 opacity-90"
          strokeWidth={1.75}
        />
        <span className="min-w-0 flex-1 truncate">{title}</span>
        <ChevronDown
          aria-hidden
          className={[
            "size-4 shrink-0 opacity-80 transition-transform duration-200",
            open ? "rotate-180" : "",
          ].join(" ")}
          strokeWidth={2.25}
        />
      </button>
      {open ? (
        <div className="mt-0.5 flex flex-col gap-0.5 pl-4">
          {Children.map(children, (child) =>
            isValidElement(child)
              ? cloneElement(child as ReactElement<{ nested?: boolean }>, {
                  nested: true,
                })
              : child,
          )}
        </div>
      ) : null}
    </div>
  );
}

export function AppSidebar({
  userName,
  orgName,
  isAdmin,
  canFinance,
  canAds,
  canManageEditorial = false,
  spacesBySlug,
  wikiPins = [],
  navProjects = [],
  navTaskPins = [],
  mobileOpen = false,
  onMobileClose,
}: {
  userName: string;
  orgName: string;
  isAdmin: boolean;
  canFinance: boolean;
  canAds: boolean;
  canManageEditorial?: boolean;
  spacesBySlug: Record<string, NavSpace | undefined>;
  wikiPins?: WikiPin[];
  navProjects?: NavProject[];
  navTaskPins?: NavTaskPin[];
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [openSections, setOpenSections] = useState<
    Partial<Record<NavSectionId, boolean>>
  >({});

  function isSectionOpen(id: NavSectionId) {
    if (openSections[id] !== undefined) return openSections[id] === true;
    if (id === "redaktion") {
      const redaktion = spacesBySlug.redaktion;
      const quellen = spacesBySlug.quellen;
      return (
        pathname === "/newsletter" ||
        pathname.startsWith("/newsletter/") ||
        pathname.startsWith("/settings/newsletter") ||
        pathname === "/schichtplan" ||
        pathname.startsWith("/schichtplan/") ||
        pathname.startsWith("/settings/schichtplan") ||
        (!!redaktion && pathname === `/spaces/${redaktion.id}`) ||
        (!!quellen && pathname === `/spaces/${quellen.id}`)
      );
    }
    if (id === "fotos") {
      return pathname === "/dam" || pathname.startsWith("/dam/");
    }
    if (id === "tasks") {
      return pathname === "/tasks" || pathname.startsWith("/tasks/");
    }
    if (id === "projekte") {
      return pathname === "/projects" || pathname.startsWith("/projects/");
    }
    return false;
  }

  function toggleSection(id: NavSectionId) {
    setOpenSections((prev) => ({ ...prev, [id]: !isSectionOpen(id) }));
  }

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

      <nav className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 py-4">
        <div className="mb-2 flex flex-col gap-0.5">
          <NavTopLink
            href="/home"
            active={pathname === "/home" || pathname === "/inbox"}
            icon={Home}
            onNavigate={onMobileClose}
          >
            Home
          </NavTopLink>
        </div>

        <NavSection
          title="Redaktion"
          icon={Newspaper}
          open={isSectionOpen("redaktion")}
          onToggle={() => toggleSection("redaktion")}
        >
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
          <NavLink
            href="/feedback"
            active={pathname === "/feedback"}
            icon={MessageCircle}
            onNavigate={onMobileClose}
          >
            Feedback
          </NavLink>
          <NavLink
            href="/schichtplan"
            active={
              pathname === "/schichtplan" ||
              pathname.startsWith("/schichtplan/")
            }
            icon={CalendarDays}
            onNavigate={onMobileClose}
          >
            Schichtplan
          </NavLink>
          {canManageEditorial && (
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
          )}
          {canManageEditorial && (
            <NavLink
              href="/settings/schichtplan"
              active={
                pathname === "/settings/schichtplan" ||
                pathname.startsWith("/settings/schichtplan/")
              }
              icon={ClipboardList}
              onNavigate={onMobileClose}
            >
              Schichtplan-Einstellungen
            </NavLink>
          )}
        </NavSection>

        <NavTopLink
          href="/carousel"
          active={
            pathname === "/carousel" || pathname.startsWith("/carousel/")
          }
          icon={Images}
          onNavigate={onMobileClose}
        >
          Social Media
        </NavTopLink>

        <NavSection
          title="Fotos"
          icon={ImagePlus}
          open={isSectionOpen("fotos")}
          onToggle={() => toggleSection("fotos")}
        >
          <NavLink
            href="/dam/upload"
            active={
              pathname === "/dam/upload" ||
              pathname.startsWith("/dam/upload/")
            }
            icon={Upload}
            onNavigate={onMobileClose}
          >
            Upload
          </NavLink>
          <NavLink
            href="/dam/personal"
            active={
              pathname === "/dam/personal" ||
              pathname.startsWith("/dam/personal/")
            }
            icon={Image}
            onNavigate={onMobileClose}
          >
            Meine Uploads
          </NavLink>
          <NavLink
            href="/dam/archive"
            active={
              pathname === "/dam" ||
              pathname === "/dam/archive" ||
              pathname.startsWith("/dam/archive/")
            }
            icon={Archive}
            onNavigate={onMobileClose}
          >
            Alle Fotos
          </NavLink>
          <NavLink
            href="/dam/papierkorb"
            active={
              pathname === "/dam/papierkorb" ||
              pathname.startsWith("/dam/papierkorb/")
            }
            icon={Trash2}
            onNavigate={onMobileClose}
          >
            Papierkorb
          </NavLink>
        </NavSection>

        <NavSection
          title="Meine Tasks"
          icon={CheckSquare}
          open={isSectionOpen("tasks")}
          onToggle={() => toggleSection("tasks")}
        >
          <NavLink
            href="/tasks"
            active={
              pathname === "/tasks" &&
              !searchParams.get("list") &&
              !searchParams.get("project")
            }
            icon={CheckSquare}
            onNavigate={onMobileClose}
          >
            Alle Tasks
          </NavLink>
          {navTaskPins.map((pin) => (
            <NavLink
              key={`${pin.kind}-${pin.id}`}
              href={
                pin.kind === "list"
                  ? `/tasks?list=${encodeURIComponent(pin.id)}`
                  : `/tasks?project=${encodeURIComponent(pin.id)}`
              }
              active={
                pathname === "/tasks" &&
                (pin.kind === "list"
                  ? searchParams.get("list") === pin.id
                  : searchParams.get("project") === pin.id)
              }
              icon={Pin}
              onNavigate={onMobileClose}
            >
              {pin.name}
            </NavLink>
          ))}
        </NavSection>

        <NavSection
          title="Projekte"
          icon={FolderKanban}
          open={isSectionOpen("projekte")}
          onToggle={() => toggleSection("projekte")}
        >
          <NavLink
            href="/projects"
            active={pathname === "/projects"}
            icon={FolderKanban}
            onNavigate={onMobileClose}
          >
            Alle Projekte
          </NavLink>
          {navProjects.map((project) => (
            <NavLink
              key={project.id}
              href={`/projects/${project.id}`}
              active={
                pathname === `/projects/${project.id}` ||
                pathname.startsWith(`/projects/${project.id}/`)
              }
              icon={Pin}
              onNavigate={onMobileClose}
            >
              {project.name}
            </NavLink>
          ))}
        </NavSection>

        {canAds && (
          <NavTopLink
            href="/ads"
            active={pathname === "/ads" || pathname.startsWith("/ads/")}
            icon={Megaphone}
            onNavigate={onMobileClose}
          >
            Werbung
          </NavTopLink>
        )}

        {canFinance && (
          <NavTopLink
            href="/payrexx"
            active={
              pathname === "/payrexx" || pathname.startsWith("/payrexx/")
            }
            icon={Wallet}
            onNavigate={onMobileClose}
          >
            Finance
          </NavTopLink>
        )}

        <NavSection
          title="Team"
          icon={Users}
          open={isSectionOpen("team")}
          onToggle={() => toggleSection("team")}
        >
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
        </NavSection>

        <NavTopLink
          href="/hours"
          active={pathname === "/hours" || pathname.startsWith("/hours/")}
          icon={Clock}
          onNavigate={onMobileClose}
        >
          Meine Arbeitszeit
        </NavTopLink>

        {isAdmin && (
          <NavSection
            title="Admin"
            icon={Settings2}
            open={isSectionOpen("admin")}
            onToggle={() => toggleSection("admin")}
          >
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
              href="/settings/notifications"
              active={
                pathname === "/settings/notifications" ||
                pathname.startsWith("/settings/notifications/")
              }
              icon={Bell}
              onNavigate={onMobileClose}
            >
              Benachrichtigungen
            </NavLink>
          </NavSection>
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
