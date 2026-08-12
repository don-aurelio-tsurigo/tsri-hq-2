import { NextResponse } from "next/server";
import { AdEventType } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type EventBody = {
  creativeId?: unknown;
  type?: unknown;
};

export async function POST(request: Request) {
  let body: EventBody;
  try {
    body = (await request.json()) as EventBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const creativeId =
    typeof body.creativeId === "string" ? body.creativeId.trim() : "";
  const typeRaw = typeof body.type === "string" ? body.type : "";
  const type =
    typeRaw === "IMPRESSION" || typeRaw === "CLICK"
      ? (typeRaw as AdEventType)
      : null;

  if (!creativeId || !type) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  // Fire-and-forget: acknowledge immediately, write after response path.
  void prisma.adEvent
    .create({
      data: { creativeId, type },
    })
    .catch((err) => {
      console.error("[ads/event]", err);
    });

  return new NextResponse(null, { status: 202 });
}
