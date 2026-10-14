import { NextResponse } from "next/server";
import { z } from "zod";
import { looksLikeImageBytes } from "@/lib/dam/accept";
import { autotagFromImageBuffer } from "@/lib/dam/autotag";
import { readImageHead } from "@/lib/dam/heic";
import { withObjectFile } from "@/lib/r2";
import { getActiveMembershipContext } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  r2Key: z.string().min(1).max(500),
});

export async function POST(request: Request) {
  const ctx = await getActiveMembershipContext();
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Ungültiges JSON." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "r2Key fehlt." }, { status: 400 });
  }

  const userId = ctx.session.user.id;
  const { r2Key } = parsed.data;
  const prefix = `staging/${userId}/`;
  if (!r2Key.startsWith(prefix) || r2Key.includes("..")) {
    return NextResponse.json({ error: "r2Key gehört nicht zu dir." }, { status: 403 });
  }

  try {
    const tags = await withObjectFile(r2Key, async ({ path }) => {
      if (!looksLikeImageBytes(await readImageHead(path))) return null;
      return autotagFromImageBuffer(userId, path);
    });
    if (!tags) {
      return NextResponse.json(
        { error: "Datei ist kein Bild." },
        { status: 400 },
      );
    }
    return NextResponse.json(tags);
  } catch (error) {
    console.error("[dam] autotag route failed", error);
    return NextResponse.json(
      { error: "Keywords konnten nicht erzeugt werden." },
      { status: 500 },
    );
  }
}
