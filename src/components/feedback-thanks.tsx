"use client";

import { useEffect, useRef, useState } from "react";
import {
  FEEDBACK_MEMBER_SHOP_OFFER,
  FEEDBACK_RATING_NEWSLETTER_LABELS,
  formatIssueDateLabel,
  parseFeedbackId,
  type FeedbackRating,
  type FeedbackStats,
  type PublicFeedbackVote,
} from "@/lib/feedback";

type Status = "loading" | "pending" | "ready" | "error";

const RATING_ORDER: FeedbackRating[] = ["POSITIVE", "NEUTRAL", "NEGATIVE"];

export function FeedbackThanks({ id }: { id: string }) {
  const [status, setStatus] = useState<Status>("loading");
  const [vote, setVote] = useState<PublicFeedbackVote | null>(null);
  const [stats, setStats] = useState<FeedbackStats | null>(null);
  const [comment, setComment] = useState("");
  const [commentState, setCommentState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [confirming, setConfirming] = useState(false);
  const botTrapRef = useRef(false);

  useEffect(() => {
    const parsedId = parseFeedbackId(id);
    if (!parsedId) {
      setStatus("error");
      return;
    }

    let cancelled = false;

    async function loadVote(feedbackId: string) {
      try {
        const res = await fetch(`/api/feedback/${feedbackId}`);
        if (!res.ok) {
          if (!cancelled) setStatus("error");
          return;
        }
        const nextVote = (await res.json()) as PublicFeedbackVote;
        if (cancelled) return;
        setVote(nextVote);
        if (nextVote.confirmed) {
          setStatus("ready");
          const nextStats = await fetchFeedbackStats(nextVote);
          if (!cancelled && nextStats) setStats(nextStats);
        } else {
          setStatus("pending");
        }
      } catch {
        if (!cancelled) setStatus("error");
      }
    }

    void loadVote(parsedId);
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    botTrapRef.current = false;
  }, [id]);

  function onBotTrap(e: React.SyntheticEvent) {
    e.preventDefault();
    e.stopPropagation();
    botTrapRef.current = true;
  }

  async function onConfirm() {
    const feedbackId = vote?.id;
    if (botTrapRef.current) return;
    if (!feedbackId || confirming || vote?.confirmed) return;
    setConfirming(true);
    try {
      const confirmRes = await fetch("/api/feedback/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: feedbackId }),
      });
      if (!confirmRes.ok) {
        setStatus("error");
        return;
      }
      const confirmed = (await confirmRes.json()) as PublicFeedbackVote;
      setVote({ ...confirmed, confirmed: true });
      setStatus("ready");
      const nextStats = await fetchFeedbackStats(confirmed);
      if (nextStats) setStats(nextStats);
    } catch {
      setStatus("error");
    } finally {
      setConfirming(false);
    }
  }

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
      const payload = (await res.json()) as { redirectTo?: string | null };
      if (payload.redirectTo) {
        window.location.assign(payload.redirectTo);
        return;
      }
      setCommentState("saved");
    } catch {
      setCommentState("error");
    }
  }

  const issueDate = stats?.issueDate ?? vote?.issueDate ?? null;
  const ratingLabel = vote
    ? FEEDBACK_RATING_NEWSLETTER_LABELS[vote.rating]
    : null;

  return (
    <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-16">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-40 opacity-90"
        style={{ background: "var(--gradient-blue)" }}
        aria-hidden
      />
      <div className="relative card space-y-5 p-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/tsuri-logo.png"
          alt="Tsüri"
          className="h-9 w-auto object-contain object-left"
        />

        {status === "loading" ? (
          <p className="text-[var(--muted)]">Einen Moment…</p>
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

        {status === "pending" && ratingLabel ? (
          <>
            <button
              type="button"
              tabIndex={-1}
              aria-hidden="true"
              className="btn btn-primary feedback-bot-trap"
              onPointerDown={onBotTrap}
              onClick={onBotTrap}
            >
              Stimme speichern
            </button>
            <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">
              Bitte bestätige deine Stimme
            </h1>
            <p className="text-[var(--muted)]">
              Du hast {ratingLabel} gewählt. Ein Tipp genügt, dann zählt sie.
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void onConfirm()}
              disabled={confirming}
            >
              {confirming ? "Wird gespeichert…" : "Stimme speichern"}
            </button>
          </>
        ) : null}

        {status === "ready" ? (
          <>
            {commentState === "saved" ? (
              <>
                <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">
                  {FEEDBACK_MEMBER_SHOP_OFFER.heading}
                </h1>
                <p className="text-[var(--muted)]">
                  {FEEDBACK_MEMBER_SHOP_OFFER.body}{" "}
                  <span className="font-semibold text-[var(--fg)]">
                    {FEEDBACK_MEMBER_SHOP_OFFER.code}
                  </span>
                </p>
                <a
                  className="btn btn-primary"
                  href={FEEDBACK_MEMBER_SHOP_OFFER.url}
                >
                  {FEEDBACK_MEMBER_SHOP_OFFER.buttonLabel}
                </a>
              </>
            ) : (
              <>
                <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">
                  Danke für dein Feedback
                </h1>
                <p className="text-[var(--muted)]">
                  {ratingLabel
                    ? `Du hast ${ratingLabel} gewählt.`
                    : "Wir haben deine Stimme erhalten."}
                </p>
              </>
            )}

            {commentState !== "saved" && stats ? (
              <div className="card-panel space-y-3 p-4">
                <p className="text-sm font-semibold">
                  {issueDate
                    ? `Ausgabe vom ${formatIssueDateLabel(issueDate)}`
                    : "Diese Ausgabe"}
                </p>
                <ul className="space-y-3">
                  {RATING_ORDER.map((rating) => (
                    <li key={rating} className="space-y-1.5">
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="text-[var(--muted)]">
                          {FEEDBACK_RATING_NEWSLETTER_LABELS[rating]}
                        </span>
                        <span className="shrink-0 font-semibold tabular-nums">
                          {stats.percentages[rating]}%
                        </span>
                      </div>
                      <span
                        className="block h-2 overflow-hidden rounded-full bg-white"
                        aria-hidden
                      >
                        <span
                          className="block h-full rounded-full bg-[var(--accent)]"
                          style={{
                            width: `${stats.percentages[rating]}%`,
                          }}
                        />
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

            {commentState === "saved" ? null : (
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

async function fetchFeedbackStats(
  vote: Pick<PublicFeedbackVote, "newsletter" | "campaignId">,
): Promise<FeedbackStats | null> {
  const statsRes = await fetch(
    `/api/feedback/stats?newsletter=${encodeURIComponent(vote.newsletter)}&campaign=${encodeURIComponent(vote.campaignId)}`,
  );
  if (!statsRes.ok) return null;
  return (await statsRes.json()) as FeedbackStats;
}
