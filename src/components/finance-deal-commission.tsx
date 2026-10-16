"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { useToast } from "@/components/toast";
import { saveFinanceDealCommission } from "@/lib/actions/finance";
import {
  commissionPeriodOf,
  commissionPeriodRangeLabel,
  commissionSplitDiff,
} from "@/lib/finance/commission";
import type { CommissionStatus, SalesPerson } from "@/lib/finance/commission-store";
import type { DealDetail } from "@/lib/finance/deals";
import { formatChfExact, monthLabel, parseAmountInput } from "@/lib/finance/shared";

const STATUS_OPTIONS: { key: CommissionStatus; label: string }[] = [
  { key: "undecided", label: "Offen" },
  { key: "relevant", label: "Provisionsrelevant" },
  { key: "not_relevant", label: "Nicht relevant" },
];

/** Badge for deal list and editor. */
export function FinanceCommissionBadge({
  status,
  salesUserName,
}: {
  status: CommissionStatus;
  salesUserName: string | null;
}) {
  if (status === "relevant") {
    return (
      <span className="inline-flex rounded-md bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-900">
        Provision{salesUserName ? ` · ${salesUserName}` : ""}
      </span>
    );
  }
  if (status === "not_relevant") {
    return (
      <span className="inline-flex rounded-md bg-[var(--panel-muted)] px-2 py-0.5 text-xs font-semibold text-[var(--muted)]">
        keine Provision
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
      Provision offen
    </span>
  );
}

function parseDate(v: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null;
}

export function FinanceDealCommission({
  deal,
  salesPeople,
  suggestedSalesUserId,
}: {
  deal: DealDetail;
  salesPeople: SalesPerson[];
  suggestedSalesUserId: string | null;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  const c = deal.commission;

  const [status, setStatus] = useState<CommissionStatus>(c.status);
  const [salesUserId, setSalesUserId] = useState(c.salesUser?.id ?? suggestedSalesUserId ?? "");
  // Default: creation day in Zurich ("sv-SE" formats as YYYY-MM-DD)
  const [soldAt, setSoldAt] = useState(
    c.soldAt ?? new Date(deal.createdAt).toLocaleDateString("sv-SE", { timeZone: "Europe/Zurich" }),
  );
  const [intern, setIntern] = useState(String(c.intern ?? deal.totalAmount));
  const [extern, setExtern] = useState(String(c.extern ?? 0));

  const internValue = parseAmountInput(intern) ?? 0;
  const externValue = parseAmountInput(extern) ?? 0;
  const amountsValid = !Number.isNaN(internValue) && !Number.isNaN(externValue);
  const diff = amountsValid
    ? commissionSplitDiff(deal.totalAmount, { intern: internValue, extern: externValue })
    : 0;
  const soldDate = parseDate(soldAt);
  const period = soldDate ? commissionPeriodOf(soldDate) : null;

  function save() {
    if (status === "relevant" && !amountsValid) {
      showToast({ message: "Ungültiger Betrag." });
      return;
    }
    startTransition(async () => {
      const result = await saveFinanceDealCommission({
        dealId: deal.id,
        commission: {
          status,
          salesUserId: salesUserId || null,
          soldAt: soldAt || null,
          intern: status === "relevant" ? internValue : null,
          extern: status === "relevant" ? externValue : null,
        },
      });
      if ("error" in result) showToast({ message: result.error });
      else {
        showToast({ message: "Provision gespeichert." });
        router.refresh();
      }
    });
  }

  if (c.locked) {
    return (
      <section className="card space-y-3 p-5">
        <Header status={c.status} salesUserName={c.salesUser?.name ?? null} />
        <p className="flex items-center gap-1.5 text-sm text-[var(--muted)]">
          <Lock className="size-3.5" />
          Abgerechnet in der Periode {monthLabel(c.period!)} – nicht mehr änderbar.
        </p>
        <Summary deal={deal} />
      </section>
    );
  }

  return (
    <section className="card space-y-4 p-5">
      <Header status={c.status} salesUserName={c.salesUser?.name ?? null} />

      <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Provision">
        {STATUS_OPTIONS.map((o) => (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={status === o.key}
            onClick={() => setStatus(o.key)}
            className={[
              "rounded-lg px-3 py-1.5 text-sm font-semibold",
              status === o.key
                ? "bg-[var(--fg)] !text-white"
                : "text-[var(--muted)] hover:bg-[var(--panel-muted)]",
            ].join(" ")}
          >
            {o.label}
          </button>
        ))}
      </div>

      {status === "relevant" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="field">
            <label htmlFor="commission-sales">Sales-Person</label>
            <select
              id="commission-sales"
              value={salesUserId}
              onChange={(e) => setSalesUserId(e.target.value)}
            >
              <option value="">– auswählen –</option>
              {salesPeople.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {salesPeople.length === 0 ? (
              <p className="mt-1 text-xs text-[var(--muted)]">
                Noch niemand ist als Sales markiert –{" "}
                <Link href="/settings/members" className="font-semibold text-[var(--accent)] hover:underline">
                  Rolle «Sales» im Team vergeben
                </Link>
                .
              </p>
            ) : null}
          </div>
          <div className="field">
            <label htmlFor="commission-sold">Verkaufsdatum</label>
            <input
              id="commission-sold"
              type="date"
              value={soldAt}
              onChange={(e) => setSoldAt(e.target.value)}
            />
            {period ? (
              <p className="mt-1 text-xs text-[var(--muted)]">
                Periode {monthLabel(period)} ({commissionPeriodRangeLabel(period)})
              </p>
            ) : null}
          </div>
          <div className="field">
            <label htmlFor="commission-intern">Verkauf Tsüri intern (CHF)</label>
            <input
              id="commission-intern"
              inputMode="decimal"
              value={intern}
              onChange={(e) => setIntern(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="commission-extern">Verkauf extern (CHF)</label>
            <input
              id="commission-extern"
              inputMode="decimal"
              value={extern}
              onChange={(e) => setExtern(e.target.value)}
            />
          </div>
          <div className="text-sm sm:col-span-2">
            {diff !== 0 ? (
              <p className="text-amber-700">
                Intern + extern weicht um {diff > 0 ? "+" : ""}
                {formatChfExact(diff)} vom Deal-Betrag ({formatChfExact(deal.totalAmount)}) ab.{" "}
                <button
                  type="button"
                  className="font-semibold underline"
                  onClick={() => setIntern(String(Math.round((deal.totalAmount - externValue) * 100) / 100))}
                >
                  Rest intern
                </button>
              </p>
            ) : (
              <p className="text-[var(--muted)]">Entspricht dem Deal-Betrag.</p>
            )}
          </div>
        </div>
      ) : null}

      <div>
        <button type="button" className="btn btn-primary" onClick={save} disabled={pending}>
          Provision speichern
        </button>
      </div>
    </section>
  );
}

function Header({ status, salesUserName }: { status: CommissionStatus; salesUserName: string | null }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="font-semibold">Provision</h2>
      <FinanceCommissionBadge status={status} salesUserName={salesUserName} />
    </div>
  );
}

function Summary({ deal }: { deal: DealDetail }) {
  const c = deal.commission;
  if (c.status !== "relevant") return null;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
      <dt className="text-[var(--muted)]">Sales-Person</dt>
      <dd>{c.salesUser?.name ?? "—"}</dd>
      <dt className="text-[var(--muted)]">Verkaufsdatum</dt>
      <dd>{c.soldAt ? new Date(c.soldAt).toLocaleDateString("de-CH") : "—"}</dd>
      <dt className="text-[var(--muted)]">Tsüri intern</dt>
      <dd className="tabular-nums">{formatChfExact(c.intern ?? 0)}</dd>
      <dt className="text-[var(--muted)]">Extern</dt>
      <dd className="tabular-nums">{formatChfExact(c.extern ?? 0)}</dd>
    </dl>
  );
}
