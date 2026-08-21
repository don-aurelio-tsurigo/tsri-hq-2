import { NextResponse } from "next/server";
import { looksLikeHeicBytes, sniffImageContentType } from "@/lib/dam/accept";
import { renderPublishedMaster } from "@/lib/dam/apply-edits";
import { contentDispositionAttachment, derivativeKey, replaceKeyExtension } from "@/lib/dam/filename";
import { jpegBufferFromHeic } from "@/lib/dam/heic";
import { prisma } from "@/lib/db";
import { getObject } from "@/lib/r2";
import { getActiveMembershipContext } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 60;

async function loadVariant(r2Key: string, variant: string) {
  const keys =
    variant === "original" || variant === "export"
      ? [r2Key]
      : variant === "web"
        ? [derivativeKey(r2Key, "web"), r2Key]
        : [derivativeKey(r2Key, "thumb"), derivativeKey(r2Key, "web"), r2Key];

  let lastError: unknown;
  for (const key of keys) {
    try {
      return await getObject(key);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error("not found");
}

function imageResponse(
  buffer: Buffer,
  contentType: string,
  extraHeaders?: Record<string, string>,
) {
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(buffer.length),
      "Cache-Control": "private, max-age=120",
      ...extraHeaders,
    },
  });
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ assetId: string }> },
) {
  const auth = await getActiveMembershipContext();
  if (!auth) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { assetId } = await ctx.params;
  const variant = new URL(request.url).searchParams.get("variant") ?? "thumb";
  const asset = await prisma.asset.findFirst({
    where: {
      id: assetId,
      OR: [
        { uploadedBy: auth.session.user.id, status: { in: ["staging", "rejected"] } },
        { status: { in: ["published", "archived"] } },
      ],
    },
    select: { r2Key: true, fileName: true, editParams: true },
  });
  if (!asset) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  try {
    let { buffer, contentType } = await loadVariant(asset.r2Key, variant);
    if (variant === "export") {
      const rendered = await renderPublishedMaster(buffer, asset.editParams);
      return imageResponse(rendered.buffer, "image/jpeg", {
        "Cache-Control": "private, no-store",
        "Content-Disposition": contentDispositionAttachment(
          replaceKeyExtension(asset.fileName, "jpg"),
        ),
      });
    }
    if (looksLikeHeicBytes(buffer)) {
      try {
        const maxEdge =
          variant === "thumb" ? 640 : variant === "web" ? 2000 : 4000;
        buffer = await jpegBufferFromHeic(buffer, maxEdge);
        contentType = "image/jpeg";
      } catch (error) {
        console.warn("[dam] HEIC preview convert failed", error);
        contentType = "image/heic";
      }
    } else {
      contentType = sniffImageContentType(buffer) ?? contentType;
    }
    return imageResponse(buffer, contentType);
  } catch {
    return NextResponse.json({ error: "file missing" }, { status: 404 });
  }
}
