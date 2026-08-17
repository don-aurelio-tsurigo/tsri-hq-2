import { NextResponse } from "next/server";
import { putObject, R2AccessError, R2ConfigError } from "@/lib/r2";
import { getActiveMembershipContext } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 40 * 1024 * 1024;

export async function POST(request: Request) {
  const ctx = await getActiveMembershipContext();
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Ungültiges Formular." }, { status: 400 });
  }

  const r2Key = String(form.get("r2Key") ?? "").trim();
  const contentType = String(form.get("contentType") ?? "").trim();
  const file = form.get("file");

  if (!r2Key || !contentType || !(file instanceof File)) {
    return NextResponse.json({ error: "Datei, r2Key und contentType sind nötig." }, { status: 400 });
  }

  const prefix = `staging/${ctx.session.user.id}/`;
  if (!r2Key.startsWith(prefix) || r2Key.includes("..")) {
    return NextResponse.json({ error: "Ungültiger r2Key." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Datei ist zu gross (max. 40 MB)." }, { status: 400 });
  }

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    await putObject(r2Key, bytes, contentType);
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
