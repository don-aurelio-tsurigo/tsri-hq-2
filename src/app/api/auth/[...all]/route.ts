import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

const handlers = toNextJsHandler(auth);

async function withOriginDebug(
  request: Request,
  handler: (req: Request) => Promise<Response>,
) {
  // #region agent log
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const payload = {
    sessionId: "43e306",
    runId: "pre-fix",
    hypothesisId: "A-C-D",
    location: "src/app/api/auth/[...all]/route.ts",
    message: "auth request origin headers",
    data: {
      method: request.method,
      url: request.url,
      origin,
      referer,
      originEqualsTsriHub: origin === "https://tsri-hub.online",
      originEqualsTsriHubSlash: origin === "https://tsri-hub.online/",
    },
    timestamp: Date.now(),
  };
  console.log("[debug-auth]", JSON.stringify(payload));
  fetch("http://127.0.0.1:7763/ingest/1fb8c4af-59a8-417d-8bad-c18c3a190274", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "43e306",
    },
    body: JSON.stringify(payload),
  }).catch(() => {});
  // #endregion
  return handler(request);
}

export const GET = (request: Request) => withOriginDebug(request, handlers.GET);
export const POST = (request: Request) =>
  withOriginDebug(request, handlers.POST);
