import { NextResponse } from "next/server";
import { z } from "zod";
import { analyzeAutoEnhance } from "@/lib/dam/auto-enhance";
import { renderDamPreviewWebp } from "@/lib/dam/apply-edits";
import { DEFAULT_EDIT_PARAMS } from "@/lib/dam/edit-params";
import { derivativeKey } from "@/lib/dam/filename";
import { prisma } from "@/lib/db";
import { getObject } from "@/lib/r2";
import { getActiveMembershipContext } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 30;

async function loadAnalysisBuffer(r2Key: string): Promise<Buffer> {
  try {
    const web = await getObject(derivativeKey(r2Key, "web"));
    return web.buffer;
  } catch {
    /* fall back below */
  }

  try {
    const thumb = await getObject(derivativeKey(r2Key, "thumb"));
    return thumb.buffer;
  } catch {
    /* fall back below */
  }

  const original = await getObject(r2Key);
  return renderDamPreviewWebp(original.buffer, DEFAULT_EDIT_PARAMS, 2000, 80);
}

export async function POST(
  _request: Request,
  ctx: { params: Promise<{ assetId: string }> },
) {
  const auth = await getActiveMembershipContext();
  if (!auth) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { assetId } = await ctx.params;
  const parsedId = z.string().min(1).max(64).safeParse(assetId);
  if (!parsedId.success) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const asset = await prisma.asset.findFirst({
    where: {
      id: parsedId.data,
      OR: [
        { uploadedBy: auth.session.user.id, status: { in: ["staging", "rejected"] } },
        { status: "published" },
      ],
    },
    select: { r2Key: true },
  });
  if (!asset) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  try {
    const buffer = await loadAnalysisBuffer(asset.r2Key);
    const suggestion = await analyzeAutoEnhance(buffer);
    return NextResponse.json(suggestion);
  } catch (error) {
    console.error("[dam] auto-enhance suggestion failed", error);
    return NextResponse.json(
      { error: "Automatische Verbesserung konnte nicht berechnet werden." },
      { status: 500 },
    );
  }
}
