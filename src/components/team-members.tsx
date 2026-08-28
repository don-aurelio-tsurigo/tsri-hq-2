"use client";

import { useEffect, useState } from "react";
import { ArchiveMemberButton, RestoreMemberButton } from "@/components/member-archive-buttons";
import { FixedDayOffSelect } from "@/components/fixed-day-off-select";
import { MemberCapabilityGrants } from "@/components/member-capability-grants";
import { MemberNameEdit } from "@/components/member-name-edit";
import { MemberPasswordHelp } from "@/components/member-password-help";
import { PensumSelect } from "@/components/pensum-select";
import { ASSIGNABLE_CAPABILITIES } from "@/lib/permissions";
import { nameIsIncomplete } from "@/lib/user-name";
import type { AppCapability } from "@/generated/prisma/client";
import {
  WEEKDAY_LABELS,
  type Weekday,
} from "@/lib/newsletter-constants";

const DRAWER_MS = 280;

export type TeamMember = {
  id: string;
  userId: string;
  role: string;
  pensumPercent: number;
  fixedDayOff: number | null;
  archivedAt: string | null;
  user: {
    name: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    birthDate: string | null;
  };
  grants: AppCapability[];
};

function roleLabel(role: string) {
  return role === "admin" ? "Admin" : "Mitglied";
}

function tagLabels(grants: AppCapability[], isAdmin: boolean) {
  return ASSIGNABLE_CAPABILITIES.filter(
    (cap) =>
      grants.includes(cap.key) && (cap.kind === "group" || !isAdmin),
  ).map((cap) => cap.label);
}

export function TeamMembersPanel({
  currentUserId,
  active,
  archived,
}: {
  currentUserId: string;
  active: TeamMember[];
  archived: TeamMember[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected =
    active.find((m) => m.id === selectedId) ??
    archived.find((m) => m.id === selectedId) ??
    null;

  return (
    <>
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-[var(--muted)] uppercase">
          Team ({active.length})
        </h2>
        <ul className="card divide-y divide-[var(--border)] overflow-hidden">
          {active.map((m) => (
            <MemberRow
              key={m.id}
              member={m}
              selected={selectedId === m.id}
              onOpen={() => setSelectedId(m.id)}
            />
          ))}
        </ul>
      </section>

      {archived.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-[var(--muted)] uppercase">
            Archiviert ({archived.length})
          </h2>
          <ul className="card divide-y divide-[var(--border)] overflow-hidden opacity-80">
            {archived.map((m) => (
              <li
                key={m.id}
                className={[
                  "flex items-center gap-3 px-4 py-1.5",
                  selectedId === m.id
                    ? "bg-[color-mix(in_oklab,var(--accent)_8%,white)]"
                    : "",
                ].join(" ")}
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  onClick={() => setSelectedId(m.id)}
                >
                  <span className="min-w-0 truncate font-medium">
                    {m.user.name}
                  </span>
                  <span className="badge badge-muted shrink-0">
                    {roleLabel(m.role)}
                  </span>
                  {m.archivedAt ? (
                    <span className="hidden truncate text-sm text-[var(--muted)] sm:inline">
                      seit{" "}
                      {new Date(m.archivedAt).toLocaleDateString("de-CH", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  ) : null}
                </button>
                <RestoreMemberButton userId={m.userId} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <MemberDrawer
        member={selected}
        currentUserId={currentUserId}
        onClose={() => setSelectedId(null)}
      />
    </>
  );
}

function MemberRow({
  member,
  selected,
  onOpen,
}: {
  member: TeamMember;
  selected: boolean;
  onOpen: () => void;
}) {
  const incomplete = nameIsIncomplete(member.user);
  const tags = tagLabels(member.grants, member.role === "admin");

  return (
    <li
      className={
        selected
          ? "bg-[color-mix(in_oklab,var(--accent)_8%,white)]"
          : undefined
      }
    >
      <button
        type="button"
        className="flex w-full items-center gap-3 px-4 py-1.5 text-left"
        onClick={onOpen}
      >
        <span className="min-w-0 truncate font-medium">{member.user.name}</span>
        <span
          className={
            member.role === "admin"
              ? "badge shrink-0"
              : "badge badge-muted shrink-0"
          }
        >
          {roleLabel(member.role)}
        </span>
        {incomplete ? (
          <span className="shrink-0 text-xs font-semibold text-[var(--danger)]">
            Name fehlt
          </span>
        ) : null}
        <span className="shrink-0 tabular-nums text-sm text-[var(--muted)]">
          {member.pensumPercent}%
        </span>
        {member.fixedDayOff != null ? (
          <span className="shrink-0 text-sm text-[var(--muted)]">
            frei {WEEKDAY_LABELS[member.fixedDayOff as Weekday]}
          </span>
        ) : null}
        <span className="hidden min-w-0 flex-1 truncate text-sm text-[var(--muted)] sm:block">
          {tags.length > 0 ? tags.join(" · ") : ""}
        </span>
        <span className="hidden shrink-0 truncate text-sm text-[var(--muted)] md:block">
          {member.user.email}
        </span>
      </button>
    </li>
  );
}

function MemberDrawer({
  member,
  currentUserId,
  onClose,
}: {
  member: TeamMember | null;
  currentUserId: string;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [panelMember, setPanelMember] = useState<TeamMember | null>(null);

  useEffect(() => {
    if (member) {
      setPanelMember(member);
      setMounted(true);
      const id = requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true));
      });
      return () => cancelAnimationFrame(id);
    }
    setVisible(false);
    const t = window.setTimeout(() => {
      setMounted(false);
      setPanelMember(null);
    }, DRAWER_MS);
    return () => window.clearTimeout(t);
  }, [member]);

  useEffect(() => {
    if (member) setPanelMember(member);
  }, [member]);

  useEffect(() => {
    if (!mounted) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [mounted, onClose]);

  if (!mounted || !panelMember) return null;

  const archived = Boolean(panelMember.archivedAt);
  const canArchive = !archived && panelMember.userId !== currentUserId;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        aria-label="Schliessen"
        className={[
          "absolute inset-0 bg-black/35 transition-opacity",
          visible ? "opacity-100" : "opacity-0",
        ].join(" ")}
        style={{ transitionDuration: `${DRAWER_MS}ms` }}
        onClick={onClose}
      />
      <aside
        className={[
          "relative flex h-full w-full max-w-md flex-col border-l border-[var(--border)] bg-[var(--bg-elevated)] shadow-[-12px_0_40px_rgba(0,0,0,0.12)] transition-transform ease-out",
          visible ? "translate-x-0" : "translate-x-full",
        ].join(" ")}
        style={{ transitionDuration: `${DRAWER_MS}ms` }}
      >
        <header className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-wide text-[var(--accent)] uppercase">
              Person bearbeiten
            </p>
            <p className="mt-1 truncate font-[family-name:var(--font-display)] text-lg font-semibold">
              {panelMember.user.name}
            </p>
            <p className="truncate text-sm text-[var(--muted)]">
              {panelMember.user.email}
            </p>
          </div>
          <button
            type="button"
            className="btn btn-ghost shrink-0"
            onClick={onClose}
          >
            Schliessen
          </button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-4">
          <section className="space-y-2">
            <h3 className="text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">
              Person
            </h3>
            <MemberNameEdit
              userId={panelMember.userId}
              firstName={panelMember.user.firstName}
              lastName={panelMember.user.lastName}
              birthDate={panelMember.user.birthDate}
            />
          </section>

          {!archived && (
            <>
              <section className="space-y-2">
                <h3 className="text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">
                  Pensum
                </h3>
                <PensumSelect
                  compact
                  userId={panelMember.userId}
                  pensumPercent={panelMember.pensumPercent}
                />
              </section>

              <section className="space-y-2">
                <h3 className="text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">
                  Fixer freier Tag
                </h3>
                <p className="text-sm text-[var(--muted)]">
                  Wochentag Mo–Fr ohne Schichtzuweisung (z.B. Schichtplan).
                </p>
                <FixedDayOffSelect
                  userId={panelMember.userId}
                  fixedDayOff={panelMember.fixedDayOff}
                />
              </section>

              <section>
                <MemberCapabilityGrants
                  userId={panelMember.userId}
                  isAdmin={panelMember.role === "admin"}
                  granted={panelMember.grants}
                />
              </section>

              <section className="space-y-2">
                <h3 className="text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">
                  Passwort
                </h3>
                <MemberPasswordHelp
                  userId={panelMember.userId}
                  name={panelMember.user.name}
                />
              </section>
            </>
          )}
        </div>

        {(canArchive || archived) && (
          <footer className="flex justify-end border-t border-[var(--border)] px-5 py-3">
            {canArchive ? (
              <ArchiveMemberButton
                userId={panelMember.userId}
                name={panelMember.user.name}
              />
            ) : (
              <RestoreMemberButton userId={panelMember.userId} />
            )}
          </footer>
        )}
      </aside>
    </div>
  );
}
