import { MAX_FILE_BYTES } from "./accept";

export type ParsedUploadObject =
  | { ok: true; r2Key: string; contentType: string; bytes: Buffer }
  | { ok: false; error: string; status: number };

function isMultipart(contentType: string): boolean {
  return contentType.toLowerCase().includes("multipart/form-data");
}

function tooLarge(): ParsedUploadObject {
  return { ok: false, error: "Datei ist zu gross (max. 40 MB).", status: 400 };
}

function missingFields(): ParsedUploadObject {
  return {
    ok: false,
    error: "Datei, r2Key und contentType sind nötig.",
    status: 400,
  };
}

function parseErrorMessage(error: unknown): string {
  const text =
    error instanceof Error ? `${error.name} ${error.message}` : String(error);
  if (/size|limit|exceeded|too large|payload/i.test(text)) {
    return "Datei ist zu gross (max. 40 MB).";
  }
  return "Ungültiges Formular.";
}

export async function parseUploadObjectRequest(
  request: Request,
): Promise<ParsedUploadObject> {
  const headerKey = (request.headers.get("x-r2-key") ?? "").trim();
  const queryKey = new URL(request.url).searchParams.get("r2Key")?.trim() ?? "";
  const r2KeyHint = headerKey || queryKey;
  const requestContentType = request.headers.get("content-type") ?? "";
  const headerContentType = (request.headers.get("x-content-type") ?? "").trim();

  if (r2KeyHint && !isMultipart(requestContentType)) {
    const fromHeader =
      headerContentType.toLowerCase() === "application/octet-stream"
        ? ""
        : headerContentType;
    const fromRequest = requestContentType.split(";")[0].trim();
    const resolvedType =
      fromHeader ||
      (fromRequest.toLowerCase() === "application/octet-stream" ? "" : fromRequest);
    if (!resolvedType) return missingFields();
    let bytes: Buffer;
    try {
      bytes = Buffer.from(await request.arrayBuffer());
    } catch (error) {
      console.error("[dam] upload-object raw body read failed", error);
      return { ok: false, error: parseErrorMessage(error), status: 400 };
    }
    if (bytes.length > MAX_FILE_BYTES) return tooLarge();
    return { ok: true, r2Key: r2KeyHint, contentType: resolvedType, bytes };
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch (error) {
    console.error("[dam] upload-object formData parse failed", error);
    return { ok: false, error: parseErrorMessage(error), status: 400 };
  }

  const r2Key = String(form.get("r2Key") ?? "").trim() || r2KeyHint;
  const contentType =
    String(form.get("contentType") ?? "").trim() || headerContentType;
  const file = form.get("file");
  if (!r2Key || !contentType || !(file instanceof Blob)) return missingFields();
  if (file.size > MAX_FILE_BYTES) return tooLarge();
  const bytes = Buffer.from(await file.arrayBuffer());
  return { ok: true, r2Key, contentType, bytes };
}
