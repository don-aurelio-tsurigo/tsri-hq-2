import { NextResponse } from "next/server";
import { z } from "zod";
import { createPublishedDownloadLinks } from "@/lib/dam/download";
import { R2ConfigError } from "@/lib/r2";
import { getActiveMembershipContext } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ assetId: string }> },
) {
  const auth = await getActiveMembershipContext();
  if (!auth) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { assetId } = await ctx.params;
  const parsed = z.string().min(1).max(64).safeParse(assetId);
  if (!parsed.success) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  try {
    const result = await createPublishedDownloadLinks(auth.session.user.id, [
      parsed.data,
    ]);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }
    const file = result.files[0];
    if (!file) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    return NextResponse.json({
      url: file.url,
      fileName: file.fileName,
      expiresIn: result.expiresIn,
    });
  } catch (error) {
    if (error instanceof R2ConfigError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    console.error("[dam] download url failed", error);
    return NextResponse.json(
      { error: "Download-Link konnte nicht erzeugt werden." },
      { status: 500 },
    );
  }
}
