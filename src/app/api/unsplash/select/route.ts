import { NextResponse } from "next/server";
import { getActiveMembershipContext } from "@/lib/session";
import {
  getUnsplashAccessKey,
  isUnsplashDownloadLocation,
  unsplashAuthHeaders,
} from "@/lib/unsplash";

export const runtime = "nodejs";

/**
 * Trigger Unsplash download tracking (API guideline) when a photo is chosen.
 * Returns the hotlinked image URL to embed in the carousel.
 */
export async function POST(request: Request) {
  const auth = await getActiveMembershipContext();
  if (!auth) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const accessKey = getUnsplashAccessKey();
  if (!accessKey) {
    return NextResponse.json(
      { error: "UNSPLASH_ACCESS_KEY fehlt in der Umgebung." },
      { status: 503 },
    );
  }

  let body: { downloadLocation?: string; imageUrl?: string };
  try {
    body = (await request.json()) as { downloadLocation?: string; imageUrl?: string };
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  const downloadLocation = body.downloadLocation?.trim() ?? "";
  const imageUrl = body.imageUrl?.trim() ?? "";
  if (!isUnsplashDownloadLocation(downloadLocation)) {
    return NextResponse.json({ error: "Ungültige Download-URL." }, { status: 400 });
  }
  if (!imageUrl.startsWith("https://images.unsplash.com/")) {
    return NextResponse.json({ error: "Ungültige Bild-URL." }, { status: 400 });
  }

  try {
    const track = await fetch(downloadLocation, {
      headers: unsplashAuthHeaders(accessKey),
      next: { revalidate: 0 },
    });
    if (!track.ok) {
      console.warn("[unsplash] download track failed", track.status);
    }
  } catch (error) {
    console.warn("[unsplash] download track error", error);
  }

  return NextResponse.json({ imageUrl });
}
