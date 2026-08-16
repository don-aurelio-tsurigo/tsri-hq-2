import { NextResponse } from "next/server";
import { consumeMemberQuota, refundMemberQuota } from "@/lib/member-quota";
import { getActiveMembershipContext } from "@/lib/session";

export const runtime = "nodejs";

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_REDIRECTS = 3;
/** Tsüri WePublish media CDN — the only origin this proxy will fetch. */
const ALLOWED_HOST = "media-tsri.wepublish.cloud";

function isAllowedMediaUrl(value: URL): boolean {
  if (value.protocol !== "https:") return false;
  if (value.username || value.password) return false;
  if (value.port && value.port !== "443") return false;
  return value.hostname.toLowerCase() === ALLOWED_HOST;
}

function parseAllowedUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  return isAllowedMediaUrl(url) ? url : null;
}

/** Same-origin proxy so html-to-image can embed WePublish cover images. */
export async function GET(request: Request) {
  const ctx = await getActiveMembershipContext();
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const raw = new URL(request.url).searchParams.get("url");
  if (!raw) {
    return NextResponse.json({ error: "url missing" }, { status: 400 });
  }

  let target = parseAllowedUrl(raw);
  if (!target) {
    return NextResponse.json({ error: "host not allowed" }, { status: 400 });
  }

  const quota = await consumeMemberQuota(ctx.session.user.id, "image_proxy");
  if (!quota.ok) {
    return NextResponse.json({ error: quota.error }, { status: 429 });
  }

  try {
    let upstream: Response | null = null;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      upstream = await fetch(target.toString(), {
        headers: { Accept: "image/*" },
        redirect: "manual",
        cache: "force-cache",
      });

      if (upstream.status < 300 || upstream.status >= 400) break;

      const location = upstream.headers.get("location");
      if (!location) {
        await refundMemberQuota(quota.id);
        return NextResponse.json({ error: "invalid redirect" }, { status: 502 });
      }
      const next = parseAllowedUrl(new URL(location, target).toString());
      if (!next) {
        await refundMemberQuota(quota.id);
        return NextResponse.json({ error: "host not allowed" }, { status: 400 });
      }
      target = next;
    }

    if (!upstream || !upstream.ok) {
      await refundMemberQuota(quota.id);
      return NextResponse.json(
        { error: `upstream ${upstream?.status ?? 0}` },
        { status: 502 },
      );
    }

    const contentType = upstream.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) {
      await refundMemberQuota(quota.id);
      return NextResponse.json({ error: "not an image" }, { status: 415 });
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_BYTES) {
      await refundMemberQuota(quota.id);
      return NextResponse.json({ error: "image too large" }, { status: 413 });
    }

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    await refundMemberQuota(quota.id);
    return NextResponse.json({ error: "fetch failed" }, { status: 502 });
  }
}
