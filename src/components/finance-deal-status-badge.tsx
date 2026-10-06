export function FinanceDealStatusBadge({ status, changed }: { status: string; changed: boolean }) {
  if (changed) {
    return (
      <span className="inline-flex rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
        geändert – prüfen
      </span>
    );
  }
  const map: Record<string, [string, string]> = {
    open: ["offen", "bg-[var(--accent-soft)] text-[var(--accent-hover)]"],
    split: ["aufgeteilt", "bg-emerald-100 text-emerald-900"],
    ignored: ["ignoriert", "bg-[var(--panel-muted)] text-[var(--muted)]"],
  };
  const [label, cls] = map[status] ?? [status, ""];
  return <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-semibold ${cls}`}>{label}</span>;
}
