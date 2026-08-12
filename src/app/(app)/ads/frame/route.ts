import { adsFrameAncestorsCsp } from "@/lib/ads-cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sanitizeSlot(raw: string | null): string {
  const slot = (raw ?? "article-top").trim();
  if (!/^[a-zA-Z0-9_-]+$/.test(slot)) return "article-top";
  return slot;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const slot = sanitizeSlot(searchParams.get("slot"));

  const html = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Anzeige</title>
<style>html,body{margin:0;padding:0;}</style>
</head>
<body>
<div data-hq-ad="${slot}"></div>
<script async src="/ads/embed.js"></script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy": adsFrameAncestorsCsp(),
    },
  });
}
