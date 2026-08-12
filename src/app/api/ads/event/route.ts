import { NextResponse } from "next/server";
import { AdEventType } from "@/generated/prisma/client";
import { adsCorsPreflight, withAdsCors } from "@/lib/ads-cors";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type EventBody = {
  creativeId?: unknown;
  type?: unknown;
};

export function OPTIONS(request: Request) {
  return adsCorsPreflight(request);
}

export async function POST(request: Request) {
  let body: EventBody;
  try {
    body = (await request.json()) as EventBody;
  } catch {
    return withAdsCors(
      request,
      NextResponse.json({ error: "invalid json" }, { status: 400 }),
    );
  }

  const creativeId =
    typeof body.creativeId === "string" ? body.creativeId.trim() : "";
  const typeRaw = typeof body.type === "string" ? body.type : "";
  const type =
    typeRaw === "IMPRESSION" || typeRaw === "CLICK"
      ? (typeRaw as AdEventType)
      : null;

  if (!creativeId || !type) {
    return withAdsCors(
      request,
      NextResponse.json({ error: "invalid body" }, { status: 400 }),
    );
  }

  void prisma.adEvent
    .create({
      data: { creativeId, type },
    })
    .catch((err) => {
      console.error("[ads/event]", err);
    });

  return withAdsCors(request, new NextResponse(null, { status: 202 }));
}
