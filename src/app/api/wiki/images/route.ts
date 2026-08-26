import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { putObject, R2AccessError, R2ConfigError } from "@/lib/r2";
import { getActiveMembershipContext } from "@/lib/session";
import {
  buildWikiImageR2Key,
  isAllowedWikiImageType,
  prepareWikiImageBytes,
  wikiImagePublicPath,
  WIKI_IMAGE_MAX_BYTES,
} from "@/lib/wiki-images";

export const runtime = "nodejs";
export const maxDuration = 60;

function sniffUploadType(file: File): string {
  const type = (file.type || "").toLowerCase();
  if (isAllowedWikiImageType(type)) return type;
  const name = file.name.toLowerCase();
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".gif")) return "image/gif";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  return type;
}

export async function POST(request: Request) {
  const ctx = await getActiveMembershipContext();
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Ungültige Upload-Daten." },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size <= 0) {
    return NextResponse.json(
      { error: "Keine Bilddatei gefunden." },
      { status: 400 },
    );
  }

  if (file.size > WIKI_IMAGE_MAX_BYTES) {
    return NextResponse.json(
      { error: "Bild ist zu gross (max. 8 MB)." },
      { status: 400 },
    );
  }

  const contentType = sniffUploadType(file);
  if (!isAllowedWikiImageType(contentType)) {
    return NextResponse.json(
      { error: "Nur JPEG, PNG, WebP oder GIF sind erlaubt." },
      { status: 400 },
    );
  }

  const imageId = randomUUID().replace(/-/g, "");
  const organizationId = ctx.membership.organizationId;
  const bytes = Buffer.from(await file.arrayBuffer());

  let prepared: Awaited<ReturnType<typeof prepareWikiImageBytes>>;
  try {
    prepared = await prepareWikiImageBytes(bytes, contentType);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Bild konnte nicht verarbeitet werden.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const r2Key = buildWikiImageR2Key({
    organizationId,
    imageId,
    contentType: prepared.contentType,
  });

  try {
    await putObject(r2Key, prepared.buffer, prepared.contentType);
  } catch (error) {
    if (error instanceof R2ConfigError || error instanceof R2AccessError) {
      const status = error instanceof R2AccessError ? 403 : 503;
      return NextResponse.json({ error: error.message }, { status });
    }
    console.error("[wiki] image upload failed", error);
    return NextResponse.json(
      { error: "Bild konnte nicht gespeichert werden." },
      { status: 500 },
    );
  }

  const row = await prisma.wikiImage.create({
    data: {
      id: imageId,
      organizationId,
      uploadedById: ctx.session.user.id,
      r2Key,
      fileName:
        file.name.slice(0, 200) ||
        `bild.${prepared.contentType.split("/")[1] ?? "jpg"}`,
      contentType: prepared.contentType,
      byteSize: prepared.buffer.byteLength,
      width: prepared.width ?? null,
      height: prepared.height ?? null,
    },
  });

  return NextResponse.json({
    id: row.id,
    url: wikiImagePublicPath(row.id),
    fileName: row.fileName,
    contentType: row.contentType,
    width: row.width,
    height: row.height,
  });
}
