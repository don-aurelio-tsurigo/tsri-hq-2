"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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

export function AppSidebar({
  userName,
  orgName,
  isAdmin,
  spacesBySlug,
  wikiPins = [],
}: {
  userName: string;
  orgName: string;
  isAdmin: boolean;
  spacesBySlug: Record<string, NavSpace | undefined>;
  wikiPins?: WikiPin[];
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  function itemClass(active: boolean) {
    return [
      "block rounded-xl px-3 py-2 text-sm font-semibold transition-colors",
      active
        ? "bg-[var(--highlight)] !text-[#0a0a0a]"
        : "text-[var(--sidebar-muted)] hover:bg-white/10 hover:text-white",
    ].join(" ");
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
    <aside className="flex w-64 shrink-0 flex-col bg-[var(--sidebar)] text-[var(--sidebar-fg)]">
      <div
        className="border-b border-black/10 px-4 py-5 text-[var(--fg)]"
        style={{ background: "var(--gradient-blue)" }}
      >
        <p className="brand-mark text-xl leading-none tracking-tight">
          Tsüri HQ 2.0
        </p>
        <p className="mt-3 truncate text-sm font-bold">{orgName}</p>
        <p className="mt-0.5 truncate text-xs font-medium opacity-80">
          {userName}
        </p>
      </div>

      <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-4">
        <div>
          <p className="mb-2 px-3 text-[0.7rem] font-extrabold tracking-wider text-[var(--sidebar-muted)] uppercase">
            Privat
          </p>
          <div className="flex flex-col gap-0.5">
            <Link
              href="/home"
              className={itemClass(
                pathname === "/home" || pathname === "/inbox",
              )}
            >
              Home
            </Link>
            <Link
              href="/hours"
              className={itemClass(
                pathname === "/hours" || pathname.startsWith("/hours/"),
              )}
            >
              Arbeitszeit
            </Link>
          </div>
        </div>

        <div>
          <p className="mb-2 px-3 text-[0.7rem] font-extrabold tracking-wider text-[var(--sidebar-muted)] uppercase">
            Redaktion
          </p>
          <div className="flex flex-col gap-0.5">
            <Link
              href={spaceHref("redaktion")}
              className={itemClass(spaceActive("redaktion"))}
            >
              Redaktion
            </Link>
            <Link
              href="/newsletter"
              className={itemClass(
                pathname === "/newsletter" ||
                  pathname.startsWith("/newsletter/"),
              )}
            >
              Newsletter
            </Link>
          </div>
        </div>

        <div>
          <p className="mb-2 px-3 text-[0.7rem] font-extrabold tracking-wider text-[var(--sidebar-muted)] uppercase">
            Tasks
          </p>
          <div className="flex flex-col gap-0.5">
            <Link
              href="/tasks"
              className={itemClass(
                pathname === "/tasks" || pathname.startsWith("/tasks/"),
              )}
            >
              Persönliche Tasks
            </Link>
            <Link
              href="/projects"
              className={itemClass(
                pathname === "/projects" || pathname.startsWith("/projects/"),
              )}
            >
              Projekte
            </Link>
          </div>
        </div>

        <div>
          <p className="mb-2 px-3 text-[0.7rem] font-extrabold tracking-wider text-[var(--sidebar-muted)] uppercase">
            Team
          </p>
          <div className="flex flex-col gap-0.5">
            <Link
              href={spaceHref("kochplan")}
              className={itemClass(spaceActive("kochplan"))}
            >
              Kochplan
            </Link>
            <Link
              href={spaceHref("ferienplan")}
              className={itemClass(spaceActive("ferienplan"))}
            >
              Ferienplan
            </Link>
            <Link
              href={spaceHref("aemliplan")}
              className={itemClass(spaceActive("aemliplan"))}
            >
              Ämtliplan
            </Link>
            <Link
              href={spaceHref("team-infos")}
              className={itemClass(spaceActive("team-infos"))}
            >
              Team Infos
            </Link>
            <Link
              href={spaceHref("wiki")}
              className={itemClass(
                spaceActive("wiki") && !searchParams.get("page"),
              )}
            >
              Wiki
            </Link>
            {wikiPins.map((pin) => (
              <Link
                key={`${pin.spaceId}-${pin.slug}`}
                href={`/spaces/${pin.spaceId}?page=${encodeURIComponent(pin.slug)}`}
                className={[
                  itemClass(wikiPageActive(pin.slug)),
                  "ml-3 !py-1.5 text-xs",
                ].join(" ")}
              >
                ★ {pin.title}
              </Link>
            ))}
          </div>
        </div>

        {isAdmin && (
          <div>
            <p className="mb-2 px-3 text-[0.7rem] font-extrabold tracking-wider text-[var(--sidebar-muted)] uppercase">
              Admin
            </p>
            <div className="flex flex-col gap-0.5">
              <Link
                href="/settings/members"
                className={itemClass(
                  pathname === "/settings/members" ||
                    pathname.startsWith("/settings/members/"),
                )}
              >
                Mitglieder & Einladen
              </Link>
              <Link
                href="/settings/hours"
                className={itemClass(
                  pathname === "/settings/hours" ||
                    pathname.startsWith("/settings/hours/"),
                )}
              >
                Arbeitszeit Team
              </Link>
            </div>
          </div>
        )}
      </nav>

      <div className="border-t border-white/10 p-3">
        <button
          type="button"
          onClick={signOut}
          className="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-[var(--sidebar-muted)] hover:bg-white/10 hover:text-white"
        >
          Abmelden
        </button>
      </div>
    </aside>
  );
}
