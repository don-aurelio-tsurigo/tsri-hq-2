import { NextResponse, type NextRequest } from "next/server";
import { getPublicAppOrigin } from "@/lib/app-url";
import {
  SITE_DESCRIPTION,
  SITE_NAME,
  formatPreviewTitle,
  isLinkPreviewBot,
  titleForPath,
} from "@/lib/link-preview";

/**
 * Auth layouts redirect anonymous users to /login. Link-preview crawlers
 * never have a session, so we serve a tiny HTML document with the right
 * Open Graph tags instead of following that redirect.
 */
export function middleware(request: NextRequest) {
  const ua = request.headers.get("user-agent");
  if (!isLinkPreviewBot(ua)) {
    return NextResponse.next();
  }

  const { pathname, search } = request.nextUrl;
  if (
    pathname.startsWith("/opengraph-image") ||
    pathname.startsWith("/twitter-image") ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/ads/")
  ) {
    return NextResponse.next();
  }

  const origin = getPublicAppOrigin();
  const section = titleForPath(pathname);
  const title = formatPreviewTitle(section);
  const url = `${origin}${pathname}${search}`;
  const image = `${origin}/opengraph-image`;

  const html = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(SITE_DESCRIPTION)}" />
<meta property="og:site_name" content="${escapeHtml(SITE_NAME)}" />
<meta property="og:title" content="${escapeHtml(title)}" />
<meta property="og:description" content="${escapeHtml(SITE_DESCRIPTION)}" />
<meta property="og:type" content="website" />
<meta property="og:url" content="${escapeHtml(url)}" />
<meta property="og:image" content="${escapeHtml(image)}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:locale" content="de_CH" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escapeHtml(title)}" />
<meta name="twitter:description" content="${escapeHtml(SITE_DESCRIPTION)}" />
<meta name="twitter:image" content="${escapeHtml(image)}" />
</head>
<body></body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icons/|brand/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
