import { NextResponse } from "next/server";
import { sniffImageContentType } from "@/lib/dam/accept";
import { parseUploadObjectRequest } from "@/lib/dam/upload-object-body";
import { putObject, R2AccessError, R2ConfigError } from "@/lib/r2";
import { getActiveMembershipContext } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const ctx = await getActiveMembershipContext();
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = await parseUploadObjectRequest(request);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }

  const prefix = `staging/${ctx.session.user.id}/`;
  if (!parsed.r2Key.startsWith(prefix) || parsed.r2Key.includes("..")) {
    return NextResponse.json({ error: "Ungültiger r2Key." }, { status: 400 });
  }

  try {
    const contentType =
      sniffImageContentType(parsed.bytes) ?? parsed.contentType;
    await putObject(parsed.r2Key, parsed.bytes, contentType);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof R2ConfigError || error instanceof R2AccessError) {
      const status = error instanceof R2AccessError ? 403 : 503;
      return NextResponse.json({ error: error.message }, { status });
    }
    console.error("[dam] upload-object failed", error);
    return NextResponse.json(
      { error: "Datei konnte nicht nach R2 geschrieben werden." },
      { status: 500 },
    );
  }
}
