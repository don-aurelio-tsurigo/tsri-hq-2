"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  FEEDBACK_MEMBERSHIP_LABELS,
  FEEDBACK_RATING_LABELS,
  FEEDBACK_RATINGS,
  formatIssueDateFull,
  newsletterLabel,
  type FeedbackCommentListItem,
  type FeedbackRating,
  type FeedbackVoteListItem,
  type IssueWithComments,
} from "@/lib/feedback";

type Tab = "issues" | "comments" | "votes";

const RATING_COLORS: Record<FeedbackRating, string> = {
  POSITIVE: "#2f9e44",
  NEUTRAL: "#8a8a8a",
  NEGATIVE: "var(--danger)",
};

function tabClass(active: boolean) {
  return [
    "rounded-full px-3 py-1.5 text-sm font-semibold transition-colors",
    active
      ? "bg-[var(--accent)] text-white"
      : "bg-[var(--highlight-soft)] text-[var(--muted)] hover:bg-[var(--highlight)] hover:text-[var(--fg)]",
  ].join(" ");
}

function scoreClass(score: number): string {
  if (score >= 70) return "text-[#1b5e20]";
  if (score < 40) return "text-[var(--danger)]";
  return "text-[var(--fg)]";
}

function DistributionBar({
  counts,
  total,
}: {
  counts: IssueWithComments["counts"];
  total: number;
}) {
  if (total === 0) {
    return <span className="text-sm text-[var(--muted)]">Keine Stimmen</span>;
  }
  return (
    <div className="min-w-[8rem]">
      <div
        className="flex h-2.5 overflow-hidden rounded-full bg-white"
        title={`Gut ${counts.POSITIVE} · Geht so ${counts.NEUTRAL} · Nicht so gut ${counts.NEGATIVE}`}
      >
        {FEEDBACK_RATINGS.map((rating) => {
          const width = (counts[rating] / total) * 100;
          if (width <= 0) return null;
          return (
            <span
              key={rating}
              className="h-full"
              style={{ width: `${width}%`, background: RATING_COLORS[rating] }}
            />
          );
        })}
      </div>
      <p className="mt-1 text-[0.7rem] tabular-nums text-[var(--muted)]">
        {counts.POSITIVE} / {counts.NEUTRAL} / {counts.NEGATIVE}
      </p>
    </div>
  );
}

function CommentMeta({
  row,
  showIssue,
}: {
  row: FeedbackCommentListItem;
  showIssue: boolean;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
      <span
        className="font-semibold"
        style={{ color: RATING_COLORS[row.rating] }}
      >
        {FEEDBACK_RATING_LABELS[row.rating]}
      </span>
      {showIssue ? (
        <>
          <span className="text-[var(--muted)]">
            {newsletterLabel(row.newsletter)}
          </span>
          <span className="text-[var(--muted)]">
            {formatIssueDateFull(row.issueDate)}
          </span>
        </>
      ) : null}
      <span className="text-xs text-[var(--muted)]">
        {`${FEEDBACK_MEMBERSHIP_LABELS[row.membershipStatus]} (${row.membershipStatus})`}
      </span>
      {row.email ? (
        <span className="text-xs text-[var(--muted)]">{row.email}</span>
      ) : null}
      <span className="text-xs text-[var(--muted)]">
        {new Date(row.commentAddedAt).toLocaleString("de-CH")}
      </span>
    </div>
  );
}

function hrefFor(input: {
  tab: Tab;
  newsletter: string;
  rating: string;
  q: string;
}) {
  const params = new URLSearchParams();
  if (input.tab !== "issues") params.set("tab", input.tab);
  if (input.newsletter) params.set("newsletter", input.newsletter);
  if (input.tab === "comments" || input.tab === "votes") {
    if (input.rating) params.set("rating", input.rating);
    if (input.q) params.set("q", input.q);
  }
  const qs = params.toString();
  return qs ? `/feedback?${qs}` : "/feedback";
}

function exportHref(input: {
  newsletter: string;
  rating: string;
  q: string;
  kind?: "votes";
}) {
  const params = new URLSearchParams();
  if (input.kind) params.set("kind", input.kind);
  if (input.newsletter) params.set("newsletter", input.newsletter);
  if (input.rating) params.set("rating", input.rating);
  if (input.q) params.set("q", input.q);
  const qs = params.toString();
  return qs ? `/feedback/export?${qs}` : "/feedback/export";
}

export function FeedbackDashboard({
  newsletters,
  newsletter,
  tab,
  issues,
  comments,
  commentsHasMore,
  votes,
  votesHasMore,
  ratingFilter,
  q,
}: {
  newsletters: string[];
  newsletter: string;
  tab: Tab;
  issues: IssueWithComments[];
  comments: FeedbackCommentListItem[];
  commentsHasMore: boolean;
  votes: FeedbackVoteListItem[];
  votesHasMore: boolean;
  ratingFilter: string;
  q: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(q);

  useEffect(() => {
    setQuery(q);
  }, [q]);

  function go(next: Partial<{ tab: Tab; newsletter: string; rating: string; q: string }>) {
    router.push(
      hrefFor({
        tab: next.tab ?? tab,
        newsletter: next.newsletter ?? newsletter,
        rating: next.rating ?? ratingFilter,
        q: next.q ?? query,
      }),
    );
  }

  const exportUrl = exportHref({
    newsletter,
    rating: ratingFilter,
    q,
    ...(tab === "votes" ? { kind: "votes" as const } : {}),
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={tabClass(tab === "issues")}
          onClick={() => go({ tab: "issues" })}
        >
          Ausgaben
        </button>
        <button
          type="button"
          className={tabClass(tab === "comments")}
          onClick={() => go({ tab: "comments" })}
        >
          Kommentare
        </button>
        <button
          type="button"
          className={tabClass(tab === "votes")}
          onClick={() => go({ tab: "votes" })}
        >
          Stimmen
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="field min-w-[12rem] flex-1">
          <span className="text-sm font-semibold text-[var(--muted)]">
            Newsletter
          </span>
          <select
            value={newsletter}
            onChange={(e) => go({ newsletter: e.target.value })}
            disabled={newsletters.length === 0}
          >
            {newsletters.length === 0 ? (
              <option value="">Keine Daten</option>
            ) : (
              newsletters.map((slug) => (
                <option key={slug} value={slug}>
                  {newsletterLabel(slug)}
                </option>
              ))
            )}
          </select>
        </label>

        {tab === "comments" || tab === "votes" ? (
          <>
            <label className="field min-w-[10rem]">
              <span className="text-sm font-semibold text-[var(--muted)]">
                Bewertung
              </span>
              <select
                value={ratingFilter}
                onChange={(e) => go({ rating: e.target.value })}
              >
                <option value="">Alle</option>
                {FEEDBACK_RATINGS.map((rating) => (
                  <option key={rating} value={rating}>
                    {FEEDBACK_RATING_LABELS[rating]}
                  </option>
                ))}
              </select>
            </label>
            <form
              className="field min-w-[14rem] flex-[2]"
              onSubmit={(e) => {
                e.preventDefault();
                go({ q: query });
              }}
            >
              <span className="text-sm font-semibold text-[var(--muted)]">
                Suche
              </span>
              <div className="flex gap-2">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={
                    tab === "votes"
                      ? "E-Mail durchsuchen…"
                      : "Kommentar durchsuchen…"
                  }
                />
                <button type="submit" className="btn btn-primary shrink-0">
                  Suchen
                </button>
              </div>
            </form>
            <a href={exportUrl} className="btn btn-ghost shrink-0">
              CSV exportieren
            </a>
          </>
        ) : null}
      </div>

      {newsletters.length === 0 ? (
        <p className="text-[var(--muted)]">
          Noch kein bestätigtes Feedback. Sobald Leser:innen abstimmen, erscheinen
          die Ausgaben hier.
        </p>
      ) : tab === "issues" ? (
        issues.length === 0 ? (
          <p className="text-[var(--muted)]">
            Für {newsletterLabel(newsletter)} gibt es noch keine bestätigten
            Stimmen.
          </p>
        ) : (
          <div className="space-y-3">
            {issues.map((issue) => (
              <article
                key={`${issue.issueDate}-${issue.campaignId}`}
                className="card space-y-4 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h2 className="font-semibold">
                      {formatIssueDateFull(issue.issueDate)}
                    </h2>
                    <p className="mt-0.5 font-mono text-xs text-[var(--muted)]">
                      {issue.campaignId}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-end gap-6">
                    <div className="text-right">
                      <p className="text-xs font-semibold text-[var(--muted)]">
                        Stimmen
                      </p>
                      <p className="tabular-nums">{issue.total}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-[var(--muted)]">
                        Verteilung
                      </p>
                      <DistributionBar
                        counts={issue.counts}
                        total={issue.total}
                      />
                    </div>
                    <div className="min-w-[3.5rem] text-right">
                      <p className="text-xs font-semibold text-[var(--muted)]">
                        Score
                      </p>
                      {issue.score === null ? (
                        <p className="text-[var(--muted)]">—</p>
                      ) : (
                        <p
                          className={`font-semibold tabular-nums ${scoreClass(issue.score)}`}
                        >
                          {issue.score}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-3 border-t border-[var(--border)] pt-3">
                  <p className="text-sm font-semibold">
                    Kommentare
                    {issue.comments.length > 0
                      ? ` · ${issue.comments.length}`
                      : ""}
                  </p>
                  {issue.comments.length === 0 ? (
                    <p className="text-sm text-[var(--muted)]">
                      Keine Kommentare zu dieser Ausgabe.
                    </p>
                  ) : (
                    <ul className="space-y-3">
                      {issue.comments.map((row) => (
                        <li key={row.id} className="space-y-1.5">
                          <CommentMeta row={row} showIssue={false} />
                          <p className="whitespace-pre-wrap text-sm">
                            {row.comment}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </article>
            ))}
            <p className="text-xs text-[var(--muted)]">
              Score 0–100 aus Gut = 1, Geht so = 0, Nicht so gut = −1.
              Balken: grün Gut, grau Geht so, rot Nicht so gut.
            </p>
          </div>
        )
      ) : tab === "votes" ? (
        votes.length === 0 ? (
          <p className="text-[var(--muted)]">Keine Stimmen für diese Filter.</p>
        ) : (
          <div className="space-y-3">
            <div className="card overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[var(--muted)]">
                    <th className="px-4 py-3 font-semibold">Ausgabe</th>
                    <th className="px-4 py-3 font-semibold">Bewertung</th>
                    <th className="px-4 py-3 font-semibold">E-Mail</th>
                    <th className="px-4 py-3 font-semibold">Zeitpunkt</th>
                    <th className="px-4 py-3 font-semibold">Mitgliedschaft</th>
                  </tr>
                </thead>
                <tbody>
                  {votes.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-[var(--border)] last:border-b-0"
                    >
                      <td className="whitespace-nowrap px-4 py-3 font-semibold">
                        {formatIssueDateFull(row.issueDate)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span
                          className="font-semibold"
                          style={{ color: RATING_COLORS[row.rating] }}
                        >
                          {FEEDBACK_RATING_LABELS[row.rating]}
                        </span>
                      </td>
                      <td className="max-w-[16rem] px-4 py-3 break-all">
                        {row.email ?? (
                          <span className="text-[var(--muted)]">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums text-[var(--muted)]">
                        {new Date(row.confirmedAt).toLocaleString("de-CH")}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-[var(--muted)]">
                        {`${FEEDBACK_MEMBERSHIP_LABELS[row.membershipStatus]} (${row.membershipStatus})`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {votesHasMore ? (
              <p className="text-sm text-[var(--muted)]">
                Weitere Stimmen vorhanden — Filter eingrenzen oder CSV
                exportieren.
              </p>
            ) : null}
          </div>
        )
      ) : comments.length === 0 ? (
        <p className="text-[var(--muted)]">Keine Kommentare für diese Filter.</p>
      ) : (
        <div className="space-y-3">
          <ul className="space-y-3">
            {comments.map((row) => (
              <li key={row.id} className="card space-y-2 p-4">
                <CommentMeta row={row} showIssue />
                <p className="whitespace-pre-wrap text-sm">{row.comment}</p>
              </li>
            ))}
          </ul>
          {commentsHasMore ? (
            <p className="text-sm text-[var(--muted)]">
              Weitere Kommentare vorhanden — Filter eingrenzen oder CSV
              exportieren.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
