import { NextResponse } from "next/server";
import { z } from "zod";
import { createPublishedDownloadLinks } from "@/lib/dam/download";
import { MAX_ARCHIVE_DOWNLOADS } from "@/lib/dam/download-constants";
import { R2ConfigError } from "@/lib/r2";
import { getActiveMembershipContext } from "@/lib/session";

export const runtime = "nodejs";

const bodySchema = z.object({
  assetIds: z.array(z.string().min(1).max(64)).min(1).max(MAX_ARCHIVE_DOWNLOADS),
});

export async function POST(request: Request) {
  const auth = await getActiveMembershipContext();
  if (!auth) {
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
    return NextResponse.json(
      { error: `Bitte 1–${MAX_ARCHIVE_DOWNLOADS} Bilder wählen.` },
      { status: 400 },
    );
  }

  try {
    const result = await createPublishedDownloadLinks(
      auth.session.user.id,
      parsed.data.assetIds,
    );
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof R2ConfigError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    console.error("[dam] bulk download urls failed", error);
    return NextResponse.json(
      { error: "Download-Links konnten nicht erzeugt werden." },
      { status: 500 },
    );
  }
}
