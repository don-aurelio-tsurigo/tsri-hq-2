import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { FinanceCommissionStatement } from "@/components/finance-commission-statement";
import {
  commissionPeriodOf,
  commissionPeriodRange,
  commissionPeriodRangeLabel,
} from "@/lib/finance/commission";
import {
  getCommissionYearForUser,
  listSalesPeople,
  type CommissionYearPeriod,
  type SalesPerson,
} from "@/lib/finance/commission-store";
import { formatChfExact, isMonthKey, monthLabel, parseMonthKey } from "@/lib/finance/shared";
import { pageTitle } from "@/lib/link-preview";
import { hasCapability, hasExplicitTag } from "@/lib/permissions";
import { requireMembership } from "@/lib/session";

export const metadata = pageTitle("Meine Provisionen");

const STATE_BADGE: Record<CommissionYearPeriod["state"], [string, string]> = {
  running: ["laufend", "bg-[var(--accent-soft)] text-[var(--accent-hover)]"],
  open: ["in Prüfung", "bg-amber-100 text-amber-900"],
  closed: ["abgerechnet", "bg-emerald-100 text-emerald-900"],
};

function daysLeft(period: string): number {
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Zurich" });
  const end = commissionPeriodRange(period).to.getTime();
  return Math.max(0, Math.round((end - new Date(`${today}T00:00:00Z`).getTime()) / 86_400_000));
}

export default async function MyCommissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ jahr?: string; periode?: string; person?: string }>;
}) {
  const { session, membership } = await requireMembership();
  const isSales = hasExplicitTag(membership, "sales");
  const isFinance = hasCapability(membership, "finance");
  if (!isSales && !isFinance) redirect("/home");

  const organizationId = membership.organizationId;
  const params = await searchParams;

  // Finance can look at every sales person; sales people only at themselves
  const people = isFinance ? await listSalesPeople(organizationId) : [];
  const self: SalesPerson | null = isSales ? { id: session.user.id, name: session.user.name } : null;
  const person =
    (isFinance && params.person ? people.find((p) => p.id === params.person) : null) ??
    self ??
    people[0] ??
    null;
  const viewingOther = person !== null && person.id !== session.user.id;

  const current = commissionPeriodOf(new Date());
  const currentYear = parseMonthKey(current)[0];
  const requestedYear = Number(params.jahr);
  const year = Number.isInteger(requestedYear) && requestedYear > 2000 && requestedYear < 2100 ? requestedYear : currentYear;
  // Period to expand; default: the running one
  const period = params.periode && isMonthKey(params.periode) ? params.periode : current;

  const href = (p: { jahr?: number; periode?: string; person?: string }) => {
    const q = new URLSearchParams();
    q.set("jahr", String(p.jahr ?? year));
    if (p.periode) q.set("periode", p.periode);
    const who = p.person ?? (viewingOther ? person?.id : undefined);
    if (who && isFinance) q.set("person", who);
    return `/provisionen?${q.toString()}`;
  };

  if (!person) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <Header title="Provisionen" />
        <p className="card p-6 text-sm text-[var(--muted)]">
          Noch niemand ist als Sales markiert. Die Rolle «Sales» wird in der Teamverwaltung vergeben.
        </p>
      </div>
    );
  }

  const yearRows = await getCommissionYearForUser(organizationId, person, year);
  const running = yearRows.find((r) => r.state === "running" && r.period === current) ?? null;
  const amount = (r: CommissionYearPeriod) => r.row.result?.amount ?? 0;
  const yearTotal = yearRows.reduce((s, r) => s + amount(r), 0);
  const settledTotal = yearRows.filter((r) => r.state === "closed").reduce((s, r) => s + amount(r), 0);
  const runningIntern = running ? running.row.deals.reduce((s, d) => s + d.intern, 0) : 0;
  const runningExtern = running ? running.row.deals.reduce((s, d) => s + d.extern, 0) : 0;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Header title={viewingOther ? `Provisionen · ${person.name}` : "Meine Provisionen"} />

      {isFinance && people.length > 1 ? (
        <nav className="flex flex-wrap gap-1" aria-label="Person">
          {people.map((p) => (
            <Link
              key={p.id}
              href={href({ person: p.id, periode: period })}
              className={[
                "rounded-lg px-3 py-1.5 text-sm font-semibold",
                p.id === person.id
                  ? "bg-[var(--fg)] !text-white"
                  : "text-[var(--muted)] hover:bg-[var(--panel-muted)]",
              ].join(" ")}
            >
              {p.name}
            </Link>
          ))}
        </nav>
      ) : null}

      {running && year === currentYear ? (
        <a href={`#periode-${current}`} className="card block p-5 hover:border-[var(--fg)]">
          <p className="text-sm text-[var(--muted)]">
            Laufende Periode {monthLabel(current)} · {commissionPeriodRangeLabel(current)} · noch{" "}
            {daysLeft(current)} {daysLeft(current) === 1 ? "Tag" : "Tage"}
          </p>
          <p className="mt-1 font-[family-name:var(--font-display)] text-4xl font-semibold tabular-nums">
            {running.row.result ? formatChfExact(running.row.result.amount) : "—"}
          </p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {running.row.deals.length} {running.row.deals.length === 1 ? "Deal" : "Deals"} · intern{" "}
            {formatChfExact(runningIntern)} · extern {formatChfExact(runningExtern)}
            {running.row.result ? "" : " · noch kein Provisionsmodell zugewiesen"}
          </p>
          <p className="mt-2 text-xs text-[var(--muted)]">
            Provisorisch – der Betrag kann sich bis zum Abschluss der Periode noch ändern.
          </p>
        </a>
      ) : null}

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Link href={href({ jahr: year - 1 })} className="btn btn-ghost px-2" aria-label="Vorheriges Jahr">
              <ChevronLeft className="size-4" />
            </Link>
            <h2 className="font-semibold">{year}</h2>
            <Link href={href({ jahr: year + 1 })} className="btn btn-ghost px-2" aria-label="Nächstes Jahr">
              <ChevronRight className="size-4" />
            </Link>
          </div>
          <p className="text-right text-sm">
            <span className="font-semibold tabular-nums">{formatChfExact(yearTotal)}</span>
            <span className="block text-xs text-[var(--muted)]">
              davon abgerechnet {formatChfExact(settledTotal)}
            </span>
          </p>
        </div>
        {yearRows.length === 0 ? (
          <p className="card px-4 py-8 text-center text-sm text-[var(--muted)]">Keine Provisionen in {year}.</p>
        ) : (
          [...yearRows].reverse().map((r) => {
            const [label, cls] = STATE_BADGE[r.state];
            return (
              <FinanceCommissionStatement
                key={r.period}
                id={`periode-${r.period}`}
                row={r.row}
                linkDeals={isFinance}
                defaultOpen={r.period === period}
                title={
                  <span className="flex flex-wrap items-center gap-2">
                    {monthLabel(r.period)}
                    <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-semibold ${cls}`}>{label}</span>
                    <span className="text-xs font-normal text-[var(--muted)]">
                      {commissionPeriodRangeLabel(r.period)}
                    </span>
                  </span>
                }
              />
            );
          })
        )}
      </section>

      <p className="text-xs text-[var(--muted)]">
        Eine Periode läuft vom 21. bis zum 20. – massgeblich ist das Verkaufsdatum des Deals. Fehlt ein
        Deal oder stimmt etwas nicht, bitte bei Finance melden.
      </p>
    </div>
  );
}

function Header({ title }: { title: string }) {
  return (
    <header>
      <p className="text-sm font-semibold tracking-wide text-[var(--accent)] uppercase">Sales</p>
      <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
        {title}
      </h1>
    </header>
  );
}
