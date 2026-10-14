import { NextResponse } from "next/server";
import { looksLikeHeicBytes, MAX_SERVER_UPLOAD_BYTES, MAX_SERVER_UPLOAD_MB } from "@/lib/dam/accept";
import { jpegBufferFromHeic } from "@/lib/dam/heic";
import { getActiveMembershipContext } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Firefox/Chrome cannot decode HEIC in the browser; render a small JPEG here. */
export async function POST(request: Request) {
  const ctx = await getActiveMembershipContext();
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let bytes: Buffer;
  try {
    bytes = Buffer.from(await request.arrayBuffer());
  } catch {
    return NextResponse.json({ error: "Ungültige Datei." }, { status: 400 });
  }
  if (bytes.length > MAX_SERVER_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `Datei ist zu gross (max. ${MAX_SERVER_UPLOAD_MB} MB).` },
      { status: 400 },
    );
  }
  if (!looksLikeHeicBytes(bytes)) {
    return NextResponse.json({ error: "Keine HEIC-Datei." }, { status: 400 });
  }

  try {
    const jpeg = await jpegBufferFromHeic(bytes, 800);
    return new NextResponse(new Uint8Array(jpeg), {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.warn("[dam] HEIC preview endpoint failed", error);
    return NextResponse.json(
      { error: "HEIC-Vorschau fehlgeschlagen." },
      { status: 500 },
    );
  }
}
