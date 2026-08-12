import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

const handlers = toNextJsHandler(auth);

async function withOriginDebug(
  request: Request,
  handler: (req: Request) => Promise<Response>,
) {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const host = request.headers.get("host");
  const xfHost = request.headers.get("x-forwarded-host");
  const xfProto = request.headers.get("x-forwarded-proto");
  const xfFor = request.headers.get("x-forwarded-for");

  const response = await handler(request);

  // #region agent log
  const setCookie = response.headers.getSetCookie?.() ?? [];
  const cookieNames = setCookie.map((c) => c.split("=")[0] ?? "");
  const payload = {
    sessionId: "b0fde8",
    runId: "pre-fix",
    hypothesisId: "A-B-C-D-E",
    location: "src/app/api/auth/[...all]/route.ts",
    message: "auth request/response diagnostics",
    data: {
      method: request.method,
      requestUrl: request.url,
      status: response.status,
      origin,
      referer,
      host,
      xfHost,
      xfProto,
      hasXfFor: Boolean(xfFor),
      originEqualsTsriHub: origin === "https://tsri-hub.online",
      cookieNames,
      cookieCount: setCookie.length,
      betterAuthUrl: process.env.BETTER_AUTH_URL ?? null,
      nextPublicAppUrl: process.env.NEXT_PUBLIC_APP_URL ?? null,
    },
    timestamp: Date.now(),
  };
  console.log("[debug-auth]", JSON.stringify(payload));
  fetch("http://127.0.0.1:7763/ingest/1fb8c4af-59a8-417d-8bad-c18c3a190274", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "b0fde8",
    },
    body: JSON.stringify(payload),
  }).catch(() => {});
  // #endregion

  return response;
}

export const GET = (request: Request) => withOriginDebug(request, handlers.GET);
export const POST = (request: Request) =>
  withOriginDebug(request, handlers.POST);
