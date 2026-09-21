import { NextResponse } from "next/server";
import { z } from "zod";
import { renderMailchimpSquare } from "@/lib/dam/apply-edits";
import {
  contentDispositionAttachment,
  replaceKeyExtension,
} from "@/lib/dam/filename";
import { prisma } from "@/lib/db";
import { getObjectBuffer, R2ConfigError } from "@/lib/r2";
import { getActiveMembershipContext } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 60;

const cropSchema = z.object({
  unit: z.literal("%"),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  width: z.number().min(1).max(100),
  height: z.number().min(1).max(100),
});

const bodySchema = z.object({
  crop: cropSchema,
});

export async function POST(
  request: Request,
  ctx: { params: Promise<{ assetId: string }> },
) {
  const auth = await getActiveMembershipContext();
  if (!auth) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { assetId } = await ctx.params;
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Ungültiges JSON." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültiger Crop." }, { status: 400 });
  }

  const crop = parsed.data.crop;
  if (crop.x + crop.width > 100.5 || crop.y + crop.height > 100.5) {
    return NextResponse.json({ error: "Ungültiger Crop." }, { status: 400 });
  }

  const asset = await prisma.asset.findFirst({
    where: { id: assetId, status: "published" },
    select: {
      id: true,
      r2Key: true,
      fileName: true,
      editParams: true,
      credit: true,
      altText: true,
      keywords: true,
      notes: true,
      rightsType: true,
      takenAt: true,
    },
  });
  if (!asset) {
    return NextResponse.json({ error: "Bild nicht gefunden." }, { status: 404 });
  }

  try {
    const original = await getObjectBuffer(asset.r2Key);
    const rendered = await renderMailchimpSquare(
      original,
      asset.editParams,
      crop,
      {
        credit: asset.credit,
        altText: asset.altText,
        keywords: asset.keywords,
        notes: asset.notes,
        rightsType: asset.rightsType,
        takenAt: asset.takenAt,
      },
    );
    const baseName = replaceKeyExtension(asset.fileName, "jpg").replace(
      /\.jpg$/i,
      "",
    );
    const fileName = `${baseName}-mailchimp-800.jpg`;

    await prisma.exportLog.create({
      data: {
        assetId: asset.id,
        exportedBy: auth.session.user.id,
      },
    });

    return new Response(new Uint8Array(rendered.buffer), {
      headers: {
        "Content-Type": rendered.contentType,
        "Content-Length": String(rendered.buffer.length),
        "Cache-Control": "private, no-store",
        "Content-Disposition": contentDispositionAttachment(fileName),
      },
    });
  } catch (error) {
    if (error instanceof R2ConfigError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    console.error("[dam] mailchimp export failed", error);
    return NextResponse.json(
      { error: "Mailchimp-Export fehlgeschlagen." },
      { status: 500 },
    );
  }
}
