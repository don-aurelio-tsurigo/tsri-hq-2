import type { Metadata } from "next";
import { FeedbackDashboard } from "@/components/feedback-dashboard";
import { isFeedbackRating, parseNewsletterSlug } from "@/lib/feedback";
import {
  listConfirmedNewsletters,
  listFeedbackComments,
  listIssueSummaries,
} from "@/lib/feedback-dashboard";
import { requireMembership } from "@/lib/session";

export const metadata: Metadata = {
  title: "Newsletter-Feedback",
};

export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    newsletter?: string;
    rating?: string;
    q?: string;
  }>;
}) {
  await requireMembership();
  const params = await searchParams;
  const tab = params.tab === "comments" ? "comments" : "issues";
  const newsletters = await listConfirmedNewsletters();
  const requested = parseNewsletterSlug(params.newsletter);
  const newsletter =
    requested && newsletters.includes(requested)
      ? requested
      : (newsletters[0] ?? "");
  const ratingRaw = params.rating?.trim().toUpperCase() ?? "";
  const ratingFilter = isFeedbackRating(ratingRaw) ? ratingRaw : "";
  const q = params.q?.trim().slice(0, 200) ?? "";

  const [issues, commentResult] = await Promise.all([
    tab === "issues" && newsletter
      ? listIssueSummaries(newsletter)
      : Promise.resolve([]),
    tab === "comments"
      ? listFeedbackComments({
          newsletter,
          rating: ratingFilter || null,
          q: q || null,
        })
      : Promise.resolve({ comments: [], hasMore: false }),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <p className="text-sm font-semibold tracking-wide text-[var(--accent)] uppercase">
          Redaktion
        </p>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
          Newsletter-Feedback
        </h1>
      </header>
      <FeedbackDashboard
        newsletters={newsletters}
        newsletter={newsletter}
        tab={tab}
        issues={issues}
        comments={commentResult.comments}
        commentsHasMore={commentResult.hasMore}
        ratingFilter={ratingFilter}
        q={q}
      />
    </div>
  );
}
