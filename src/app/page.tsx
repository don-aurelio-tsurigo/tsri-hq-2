import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

export default async function HomePage() {
  const t0 = Date.now();
  const session = await getSession();
  // #region agent log
  const m = process.memoryUsage();
  fetch("http://127.0.0.1:7763/ingest/1fb8c4af-59a8-417d-8bad-c18c3a190274", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "53d2ad",
    },
    body: JSON.stringify({
      sessionId: "53d2ad",
      hypothesisId: "C",
      location: "app/page.tsx:HomePage",
      message: "root health/session",
      data: {
        ms: Date.now() - t0,
        hasSession: Boolean(session),
        rssMb: Math.round(m.rss / 1048576),
        heapMb: Math.round(m.heapUsed / 1048576),
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
  redirect(session ? "/home" : "/login");
}
