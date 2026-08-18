export function damMem() {
  const m = process.memoryUsage();
  return {
    rssMb: Math.round(m.rss / 1048576),
    heapMb: Math.round(m.heapUsed / 1048576),
    heapTotalMb: Math.round(m.heapTotal / 1048576),
    extMb: Math.round(m.external / 1048576),
  };
}

export function damDebug(
  hypothesisId: string,
  location: string,
  message: string,
  data: Record<string, unknown>,
) {
  const payload = {
    sessionId: "0cc28a",
    runId: "post-fix",
    hypothesisId,
    location,
    message,
    data,
    timestamp: Date.now(),
  };
  console.log(`[debug-0cc28a] ${JSON.stringify(payload)}`);
  fetch("http://127.0.0.1:7763/ingest/1fb8c4af-59a8-417d-8bad-c18c3a190274", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "0cc28a",
    },
    body: JSON.stringify(payload),
  }).catch(() => {});
}
