import Link from "next/link";

export type ProjectKindFilterValue = "all" | "event" | "vorhaben";

export function parseProjectKindFilter(
  value: string | undefined,
): ProjectKindFilterValue {
  if (value === "event" || value === "vorhaben") return value;
  return "all";
}

export function ProjectKindFilter({
  kind,
  counts,
}: {
  kind: ProjectKindFilterValue;
  counts: { all: number; event: number; vorhaben: number };
}) {
  const options: Array<{
    id: ProjectKindFilterValue;
    href: string;
    label: string;
    count: number;
  }> = [
    { id: "all", href: "/projects", label: "Alle", count: counts.all },
    {
      id: "event",
      href: "/projects?kind=event",
      label: "Events",
      count: counts.event,
    },
    {
      id: "vorhaben",
      href: "/projects?kind=vorhaben",
      label: "Projekte allg.",
      count: counts.vorhaben,
    },
  ];

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {options.map((opt) => {
        const active = kind === opt.id;
        return (
          <Link
            key={opt.id}
            href={opt.href}
            aria-current={active ? "page" : undefined}
            className={[
              "rounded-full border px-3 py-1.5 text-sm font-semibold transition",
              active
                ? "border-[var(--fg)] bg-[var(--fg)] !text-white"
                : "border-[var(--border)] bg-white text-[var(--muted)] hover:border-[var(--fg)] hover:text-[var(--fg)]",
            ].join(" ")}
          >
            {opt.label} ({opt.count})
          </Link>
        );
      })}
    </div>
  );
}
