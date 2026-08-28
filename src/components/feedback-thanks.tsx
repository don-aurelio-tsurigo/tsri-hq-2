"use client";

import { useEffect, useState } from "react";
import {
  FEEDBACK_RATING_LABELS,
  formatIssueDateLabel,
  parseFeedbackId,
  type FeedbackRating,
  type FeedbackStats,
} from "@/lib/feedback";

type ConfirmPayload = {
  id: string;
  newsletter: string;
  campaignId: string;
  issueDate: string;
  rating: FeedbackRating;
};

type Status = "loading" | "ready" | "error";

const RATING_ORDER: FeedbackRating[] = ["POSITIVE", "NEUTRAL", "NEGATIVE"];

export function FeedbackThanks({ id }: { id: string }) {
  const [status, setStatus] = useState<Status>("loading");
  const [vote, setVote] = useState<ConfirmPayload | null>(null);
  const [stats, setStats] = useState<FeedbackStats | null>(null);
  const [comment, setComment] = useState("");
  const [commentState, setCommentState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");

  useEffect(() => {
    const parsedId = parseFeedbackId(id);
    if (!parsedId) {
      setStatus("error");
      return;
    }

    let cancelled = false;

    async function confirmAndLoad(feedbackId: string) {
      try {
        const confirmRes = await fetch("/api/feedback/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: feedbackId }),
        });
        if (!confirmRes.ok) {
          if (!cancelled) setStatus("error");
          return;
        }
        const confirmed = (await confirmRes.json()) as ConfirmPayload;
        if (cancelled) return;
        setVote(confirmed);
        setStatus("ready");

        const statsRes = await fetch(
          `/api/feedback/stats?newsletter=${encodeURIComponent(confirmed.newsletter)}&campaign=${encodeURIComponent(confirmed.campaignId)}`,
        );
        if (!statsRes.ok || cancelled) return;
        const nextStats = (await statsRes.json()) as FeedbackStats;
        if (!cancelled) setStats(nextStats);
      } catch {
        if (!cancelled) setStatus("error");
      }
    }

    void confirmAndLoad(parsedId);
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function onSubmitComment(e: React.FormEvent) {
    e.preventDefault();
    const feedbackId = vote?.id;
    if (!feedbackId || commentState === "saving" || commentState === "saved") {
      return;
    }
    setCommentState("saving");
    try {
      const res = await fetch(`/api/feedback/${feedbackId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment }),
      });
      if (!res.ok) {
        setCommentState("error");
        return;
      }
      setCommentState("saved");
    } catch {
      setCommentState("error");
    }
  }

  const issueDate = stats?.issueDate ?? vote?.issueDate ?? null;

  return (
    <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-16">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-40 opacity-90"
        style={{ background: "var(--gradient-blue)" }}
        aria-hidden
      />
      <div className="relative card space-y-5 p-6">
        <p className="brand-mark text-sm tracking-[0.04em] uppercase">
          Tsüri Newsletter
        </p>

        {status === "loading" ? (
          <p className="text-[var(--muted)]">Dein Feedback wird gespeichert…</p>
        ) : null}

        {status === "error" ? (
          <>
            <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">
              Link ungültig
            </h1>
            <p className="text-[var(--muted)]">
              Dieser Feedback-Link ist ungültig oder abgelaufen. Du kannst das
              Fenster schliessen.
            </p>
          </>
        ) : null}

        {status === "ready" ? (
          <>
            <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">
              Danke für dein Feedback
            </h1>
            <p className="text-[var(--muted)]">
              {vote
                ? `Du hast «${FEEDBACK_RATING_LABELS[vote.rating]}» gewählt.`
                : "Wir haben deine Stimme erhalten."}
            </p>

            {stats ? (
              <div className="card-panel space-y-3 p-4">
                <p className="text-sm font-semibold">
                  {issueDate
                    ? `Ausgabe vom ${formatIssueDateLabel(issueDate)}`
                    : "Diese Ausgabe"}
                </p>
                <ul className="space-y-2">
                  {RATING_ORDER.map((rating) => (
                    <li key={rating} className="flex items-center gap-3 text-sm">
                      <span className="w-28 shrink-0 text-[var(--muted)]">
                        {FEEDBACK_RATING_LABELS[rating]}
                      </span>
                      <span
                        className="h-2 flex-1 overflow-hidden rounded-full bg-white"
                        aria-hidden
                      >
                        <span
                          className="block h-full rounded-full bg-[var(--accent)]"
                          style={{
                            width: `${stats.percentages[rating]}%`,
                          }}
                        />
                      </span>
                      <span className="w-10 text-right font-semibold tabular-nums">
                        {stats.percentages[rating]}%
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-[var(--muted)]">
                  {stats.total === 1
                    ? "1 Stimme bisher"
                    : `${stats.total} Stimmen bisher`}
                </p>
              </div>
            ) : null}

            {commentState === "saved" ? (
              <p className="text-sm font-semibold">
                Danke, wir haben deine Rückmeldung erhalten.
              </p>
            ) : (
              <form className="space-y-3" onSubmit={onSubmitComment}>
                <div className="field">
                  <label htmlFor="feedback-comment">
                    Was können wir besser machen?
                  </label>
                  <textarea
                    id="feedback-comment"
                    rows={4}
                    maxLength={2000}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Optional — ein Satz reicht."
                  />
                </div>
                {commentState === "error" ? (
                  <p className="text-sm text-[var(--danger)]">
                    Konnte nicht gespeichert werden. Bitte noch einmal versuchen.
                  </p>
                ) : null}
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={
                    comment.trim().length === 0 || commentState === "saving"
                  }
                >
                  {commentState === "saving" ? "Senden…" : "Absenden"}
                </button>
              </form>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
