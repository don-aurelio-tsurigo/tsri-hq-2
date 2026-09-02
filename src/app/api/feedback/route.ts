import { NextResponse } from "next/server";
import { getPublicAppOrigin } from "@/lib/app-url";
import { prisma } from "@/lib/db";
import {
  clientIp,
  consumeFeedbackRateLimit,
  parseFeedbackClickInput,
  resolveFeedbackIssueDate,
  truncateUserAgent,
} from "@/lib/feedback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const ip = clientIp(request);
  if (!consumeFeedbackRateLimit(ip)) {
    return new NextResponse("Zu viele Anfragen. Bitte später noch einmal.", {
      status: 429,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const url = new URL(request.url);
  const parsed = parseFeedbackClickInput({
    newsletter: url.searchParams.get("newsletter"),
    campaign: url.searchParams.get("campaign"),
    date: url.searchParams.get("date"),
    rating: url.searchParams.get("rating"),
    email: url.searchParams.get("email"),
    membership: url.searchParams.get("membership"),
  });

  if (!parsed) {
    return new NextResponse("Ungültiger Feedback-Link.", {
      status: 400,
      headers: { "Cache-Control": "no-store" },
    });
  }

  let existingDate: string | null = null;
  if (!parsed.issueDate) {
    const existing = await prisma.feedbackResponse.findFirst({
      where: {
        newsletter: parsed.newsletter,
        campaignId: parsed.campaignId,
      },
      orderBy: { createdAt: "asc" },
      select: { issueDate: true },
    });
    existingDate = existing?.issueDate ?? null;
  }

  const created = await prisma.feedbackResponse.create({
    data: {
      newsletter: parsed.newsletter,
      campaignId: parsed.campaignId,
      issueDate: resolveFeedbackIssueDate({
        parsedDate: parsed.issueDate,
        existingDate,
      }),
      rating: parsed.rating,
      email: parsed.email,
      membershipStatus: parsed.membershipStatus,
      userAgent: truncateUserAgent(request.headers.get("user-agent")),
    },
    select: { id: true },
  });

  const dest = new URL(`/feedback/danke?id=${created.id}`, getPublicAppOrigin());
  const response = NextResponse.redirect(dest, 302);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
