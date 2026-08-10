"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  bulkUpdateNewsItemStatusAction,
  refreshNewsFeed,
  updateNewsItemStatusAction,
} from "@/lib/actions";
import { NewsFeedArticleGenerate } from "@/components/news-feed-article-generate";
import {
  NEWS_ITEM_STATUS_LABELS,
} from "@/lib/news-feed-constants";
import type { NewsItemStatus } from "@/generated/prisma/client";
import type { NewsFeedRow } from "@/lib/news-feed";

type SourceOption = {
  key: string;
  label: string;
};

const STATUS_TABS: { key: NewsItemStatus | ""; label: string }[] = [
  { key: "neu", label: "Neu" },
  { key: "interessant", label: "Interessant" },
  { key: "beobachten", label: "Beobachten" },
  { key: "verworfen", label: "Verworfen" },
  { key: "", label: "Alle" },
];

const STATUS_ACTIONS: { status: NewsItemStatus; label: string; danger?: boolean }[] =
  [
    { status: "interessant", label: "Interessant" },
    { status: "beobachten", label: "Beobachten" },
    { status: "verworfen", label: "Verwerfen", danger: true },
    { status: "neu", label: "Zurück zu Neu" },
  ];

function formatDate(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("de-CH", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/** Feed-Karten zeigen nur Teaser; Volltext bleibt in summary für die Generierung. */
function teaserText(summary: string | null, max = 280): string | null {
  if (!summary?.trim()) return null;
  const text = summary.trim().replace(/\s+/g, " ");
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const at = cut.lastIndexOf(" ");
  return `${(at > 120 ? cut.slice(0, at) : cut).trim()}…`;
}

function tabClass(active: boolean) {
  return [
    "rounded-full px-3 py-1.5 text-sm font-semibold transition-colors",
    active
      ? "bg-[var(--accent)] text-white"
      : "bg-[var(--highlight-soft)] text-[var(--muted)] hover:bg-[var(--highlight)] hover:text-[var(--fg)]",
  ].join(" ");
}

export function NewsFeed({
  items,
  sources,
  statusCounts,
  initialStatus,
  initialSource,
}: {
  items: NewsFeedRow[];
  sources: SourceOption[];
  statusCounts: Record<NewsItemStatus, number>;
  initialStatus: NewsItemStatus | "";
  initialSource: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<NewsItemStatus | "">(initialStatus);
  const [source, setSource] = useState(initialSource);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const visibleActions = useMemo(() => {
    return STATUS_ACTIONS.filter((a) => a.status !== status);
  }, [status]);

  function navigate(nextStatus: NewsItemStatus | "", nextSource: string) {
    const params = new URLSearchParams();
    params.set("status", nextStatus || "all");
    if (nextSource) params.set("source", nextSource);
    router.push(`?${params.toString()}`);
  }

  function onStatusTab(next: NewsItemStatus | "") {
    setStatus(next);
    setSelected(new Set());
    setMessage(null);
    navigate(next, source);
  }

  function onSourceTab(next: string) {
    setSource(next);
    setSelected(new Set());
    setMessage(null);
    navigate(status, next);
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function setItemStatus(id: string, nextStatus: NewsItemStatus) {
    startTransition(async () => {
      const result = await updateNewsItemStatusAction(id, nextStatus);
      if ("error" in result && result.error) {
        setMessage(result.error);
        return;
      }
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      router.refresh();
    });
  }

  function bulkDiscard() {
    if (selected.size === 0) return;
    startTransition(async () => {
      const result = await bulkUpdateNewsItemStatusAction(
        [...selected],
        "verworfen",
      );
      if ("error" in result && result.error) {
        setMessage(result.error);
        return;
      }
      setSelected(new Set());
      setMessage(`${result.updated ?? 0} Einträge verworfen.`);
      router.refresh();
    });
  }

  function refresh() {
    startTransition(async () => {
      setMessage(null);
      const result = await refreshNewsFeed();
      if ("error" in result && result.error) {
        setMessage(result.error);
        return;
      }
      const failed = (result.results ?? []).filter((r) => r.error);
      const parts = [
        `${result.fetched ?? 0} gelesen`,
        `${result.inserted ?? 0} neu`,
      ];
      if (failed.length > 0) {
        parts.push(`${failed.length} Quellen mit Fehler`);
      }
      setMessage(parts.join(" · "));
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {STATUS_TABS.map((tab) => {
            const count =
              tab.key === ""
                ? Object.values(statusCounts).reduce((a, b) => a + b, 0)
                : statusCounts[tab.key];
            return (
              <button
                key={tab.key || "all"}
                type="button"
                className={tabClass(status === tab.key)}
                onClick={() => onStatusTab(tab.key)}
              >
                {tab.label}
                <span className="ml-1.5 opacity-70">{count}</span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          className="btn"
          disabled={pending}
          onClick={refresh}
        >
          {pending ? "Bitte warten…" : "Jetzt aktualisieren"}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={tabClass(source === "")}
          onClick={() => onSourceTab("")}
        >
          Alle Quellen
        </button>
        {sources.map((s) => (
          <button
            key={s.key}
            type="button"
            className={tabClass(source === s.key)}
            onClick={() => onSourceTab(s.key)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {message && (
        <p className="rounded-xl border border-[var(--border)] bg-[var(--highlight-soft)] px-4 py-2 text-sm text-[var(--muted)]">
          {message}
        </p>
      )}

      {selected.size > 0 && (
        <div className="card flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <span className="text-sm font-semibold">
            {selected.size} ausgewählt
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn btn-danger"
              disabled={pending}
              onClick={bulkDiscard}
            >
              Verwerfen
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setSelected(new Set())}
            >
              Auswahl aufheben
            </button>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <div className="card px-5 py-12 text-center text-[var(--muted)]">
          Noch keine Einträge
          {status ? ` mit Status „${NEWS_ITEM_STATUS_LABELS[status]}“` : ""}.
          Mit „Jetzt aktualisieren“ Quellen einlesen.
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => {
            const teaser = teaserText(item.summary);
            return (
            <li key={item.id} className="card space-y-3 px-5 py-4">
              <div className="flex flex-wrap items-start gap-3">
                <label className="mt-1 flex shrink-0 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selected.has(item.id)}
                    onChange={() => toggleSelect(item.id)}
                    className="size-4 rounded border-[var(--border)]"
                  />
                </label>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="badge badge-muted">{item.sourceLabel}</span>
                    <span className="text-xs text-[var(--muted)]">
                      {formatDate(item.publishedAt ?? item.fetchedAt)}
                    </span>
                  </div>
                  <a
                    href={item.link}
                    target="_blank"
                    rel="noreferrer"
                    className="block font-[family-name:var(--font-display)] text-lg font-semibold hover:underline"
                  >
                    {item.title}
                  </a>
                  {teaser && (
                    <p className="text-sm text-[var(--muted)]">{teaser}</p>
                  )}
                </div>
              </div>
              <div className="space-y-2 pl-7">
                <div className="flex flex-wrap gap-2">
                  {visibleActions.map((action) => (
                    <button
                      key={action.status}
                      type="button"
                      disabled={pending}
                      className={[
                        action.danger ? "btn btn-danger" : "btn btn-ghost",
                        "!px-2.5 !py-1 text-xs",
                      ].join(" ")}
                      onClick={() => setItemStatus(item.id, action.status)}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
                <NewsFeedArticleGenerate
                  newsItemId={item.id}
                  sourceKey={item.source}
                />
              </div>
            </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
