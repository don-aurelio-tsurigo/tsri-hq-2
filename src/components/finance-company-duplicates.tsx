"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast";
import { mergeFinanceCompanies } from "@/lib/actions/finance";
import type { AdminCompany } from "@/lib/finance/companies";

/** Groups of similar names; the user decides which entry stays. */
export function FinanceCompanyDuplicates({ groups }: { groups: AdminCompany[][] }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="card border-amber-300 bg-amber-50/60">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left text-sm"
        aria-expanded={open}
      >
        <span>
          <b>{groups.length} mögliche Duplikate</b> – ähnliche Namen, die vielleicht dieselbe
          Organisation sind.
        </span>
        <span className="font-semibold text-[var(--accent-hover)]">{open ? "Ausblenden" : "Prüfen"}</span>
      </button>
      {open ? (
        <ul className="space-y-3 px-5 pb-5">
          {groups.map((g) => (
            <DuplicateGroup key={g.map((c) => c.id).join("-")} group={g} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function DuplicateGroup({ group }: { group: AdminCompany[] }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  // Default: keep the one with most deals/bookings
  const [keepId, setKeepId] = useState(
    () => [...group].sort((a, b) => b.bookingCount + b.dealCount - (a.bookingCount + a.dealCount))[0].id,
  );

  function merge() {
    const keep = group.find((c) => c.id === keepId)!;
    const others = group.filter((c) => c.id !== keepId);
    if (
      !window.confirm(
        `${others.map((c) => `«${c.name}»`).join(", ")} in «${keep.name}» zusammenführen? Alle Deals und Buchungen werden übertragen.`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      for (const o of others) {
        const result = await mergeFinanceCompanies({ sourceId: o.id, targetId: keepId });
        if ("error" in result) {
          showToast({ message: result.error });
          return;
        }
      }
      showToast({ message: `Zusammengeführt in «${keep.name}».` });
      router.refresh();
    });
  }

  return (
    <li className="rounded-lg border-2 border-[var(--border)] bg-[var(--bg-elevated)] p-3">
      <fieldset className="space-y-1.5 text-sm">
        <legend className="mb-1 text-xs font-bold text-[var(--muted)] uppercase">Behalten:</legend>
        {group.map((c) => (
          <label key={c.id} className="flex items-center gap-2">
            <input type="radio" checked={keepId === c.id} onChange={() => setKeepId(c.id)} />
            <Link href={`/finance/organisationen/${c.id}`} className="font-semibold hover:underline">
              {c.name}
            </Link>
            <span className="text-xs text-[var(--muted)]">
              {c.dealCount} Deals · {c.bookingCount} Buchungen
              {c.pipedriveId ? ` · Pipedrive #${c.pipedriveId}` : ""}
            </span>
          </label>
        ))}
      </fieldset>
      <div className="mt-2 flex gap-2">
        <button type="button" className="btn btn-primary px-3 py-1 text-sm" onClick={merge} disabled={pending}>
          {pending ? "Führe zusammen…" : "Zusammenführen"}
        </button>
      </div>
    </li>
  );
}
