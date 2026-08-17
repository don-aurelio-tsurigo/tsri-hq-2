import { NextResponse } from "next/server";
import { derivativeKey } from "@/lib/dam/filename";
import { prisma } from "@/lib/db";
import { getObject } from "@/lib/r2";
import { getActiveMembershipContext } from "@/lib/session";

export const runtime = "nodejs";

async function loadVariant(r2Key: string, variant: string) {
  const keys =
    variant === "original"
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
    select: { r2Key: true },
  });
  if (!asset) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  try {
    const { buffer, contentType } = await loadVariant(asset.r2Key, variant);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=120",
      },
    });
  } catch {
    return NextResponse.json({ error: "file missing" }, { status: 404 });
  }
}
