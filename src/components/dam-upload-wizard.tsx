"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useDropzone, type FileRejection } from "react-dropzone";
import {
  Check,
  ChevronDown,
  ImagePlus,
  LoaderCircle,
  RotateCw,
  Upload,
  User,
  X,
} from "lucide-react";
import { DamCombobox } from "@/components/dam-combobox";
import { MAX_FILE_BYTES, MAX_FILES, rejectReason } from "@/lib/dam/accept";
import {
  defaultCollectionName,
  suggestedRightsType,
} from "@/lib/dam/upload-defaults";

type RightsType = "own" | "provided" | "free_use";

type CollectionOption = {
  id: string;
  name: string;
  isPersonal: boolean;
};

type QueuedFile = {
  id: string;
  file: File;
  previewUrl: string;
};

type PreparedFile = {
  localId: string;
  clientName: string;
  sequence: number;
  fileName: string;
  r2Key: string;
  uploadUrl: string;
  contentType: string;
  size: number;
  previewUrl: string;
  file: File;
};

type AssetDraft = {
  r2Key: string;
  sequence: number;
  fileName: string;
  originalName: string;
  contentType: string;
  size: number;
  previewUrl: string;
  rightsType: RightsType;
  keywords: string;
  credit: string;
  collectionIds: string[];
  newCollections: string[];
};

type BatchStatusAsset = {
  id: string;
  sequence: number;
  fileName: string;
  status: string;
  altText: string | null;
  keywords: string[];
  takenAt: string | null;
  width: number | null;
  height: number | null;
};

type FileUploadState = {
  status: "waiting" | "uploading" | "done" | "error";
  progress: number;
  error?: string;
};

const RIGHTS_LABELS: { value: RightsType; label: string }[] = [
  { value: "own", label: "Eigenes Foto (own)" },
  { value: "provided", label: "Zur Verfügung gestellt (provided)" },
  { value: "free_use", label: "Freie Nutzung (free_use)" },
];

function parseKeywordInput(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function namesFrom(value: string): string[] {
  const name = value.trim();
  return name ? [name] : [];
}

async function putViaServer(
  r2Key: string,
  file: File,
  contentType: string,
  onProgress: (pct: number) => void,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/dam/upload-object");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      let message = `Server-Upload fehlgeschlagen (HTTP ${xhr.status}).`;
      try {
        const data = JSON.parse(xhr.responseText) as { error?: string };
        if (data.error) message = data.error;
      } catch {
        /* keep default */
      }
      reject(new Error(message));
    };
    xhr.onerror = () => reject(new Error("Server-Upload fehlgeschlagen."));
    const form = new FormData();
    form.set("r2Key", r2Key);
    form.set("contentType", contentType);
    form.set("file", file);
    xhr.send(form);
  });
}

async function putFile(
  url: string,
  r2Key: string,
  file: File,
  contentType: string,
  onProgress: (pct: number) => void,
): Promise<void> {
  try {
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", url);
      xhr.setRequestHeader("Content-Type", contentType);
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          onProgress(Math.round((event.loaded / event.total) * 100));
        }
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else reject(new Error(`R2-Upload fehlgeschlagen (HTTP ${xhr.status}).`));
      };
      xhr.onerror = () => reject(new Error("R2_CORS"));
      xhr.send(file);
    });
  } catch {
    await putViaServer(r2Key, file, contentType, onProgress);
  }
}

function MetaFields({
  fieldId,
  rightsType,
  onRights,
  keywords,
  onKeywords,
  collectionIds,
  onCollectionIds,
  collections,
  newCollectionName,
  onNewCollectionName,
  credit,
  onCredit,
  showCredit,
  collectionInputRef,
  autoFocusCollection,
}: {
  fieldId: string;
  rightsType: RightsType;
  onRights: (v: RightsType) => void;
  keywords: string;
  onKeywords: (v: string) => void;
  collectionIds: string[];
  onCollectionIds: (ids: string[]) => void;
  collections: CollectionOption[];
  newCollectionName: string;
  onNewCollectionName: (name: string) => void;
  credit?: string;
  onCredit?: (v: string) => void;
  showCredit?: boolean;
  collectionInputRef?: React.Ref<HTMLInputElement>;
  autoFocusCollection?: boolean;
}) {
  const [existingOpen, setExistingOpen] = useState(collectionIds.length > 0);
  const collectionOptions = collections.map((c) => ({
    value: c.id,
    label: c.name,
  }));

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="field">
        <label>Rechte-Typ</label>
        <select
          value={rightsType}
          onChange={(e) => onRights(e.target.value as RightsType)}
        >
          {RIGHTS_LABELS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Keywords (kommagetrennt)</label>
        <input
          value={keywords}
          onChange={(e) => onKeywords(e.target.value)}
          placeholder="zürich, demo, strasse"
        />
      </div>
      {showCredit && onCredit ? (
        <div className="field sm:col-span-2">
          <label>Credit</label>
          <input value={credit ?? ""} onChange={(e) => onCredit(e.target.value)} />
        </div>
      ) : null}
      <div className="field sm:col-span-2">
        <label htmlFor={`${fieldId}-new-collection`}>Neue Collection</label>
        <input
          id={`${fieldId}-new-collection`}
          ref={collectionInputRef}
          autoFocus={autoFocusCollection}
          value={newCollectionName}
          onChange={(e) => onNewCollectionName(e.target.value)}
          placeholder="Paul Muster – 17.08.2026"
        />
      </div>
      <div className="sm:col-span-2 space-y-2">
        <button
          type="button"
          className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--accent)] hover:underline"
          aria-expanded={existingOpen}
          onClick={() => setExistingOpen((prev) => !prev)}
        >
          <ChevronDown
            className={[
              "size-4 transition-transform",
              existingOpen ? "rotate-180" : "",
            ].join(" ")}
            aria-hidden
          />
          Stattdessen zu bestehender Collection hinzufügen
        </button>
        {existingOpen ? (
          <DamCombobox
            id={`${fieldId}-existing-collections`}
            label="Bestehende Collections"
            emptyLabel="Collections suchen…"
            placeholder="Collection suchen…"
            options={collectionOptions}
            value={collectionIds}
            multiple
            onChange={onCollectionIds}
          />
        ) : collectionIds.length > 0 ? (
          <p className="text-sm text-[var(--muted)]">
            Zusätzlich:{" "}
            {collectionIds
              .map((id) => collections.find((c) => c.id === id)?.name ?? id)
              .join(", ")}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function BatchStatus({ batchId }: { batchId: string }) {
  const [assets, setAssets] = useState<BatchStatusAsset[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let ticks = 0;

    async function load() {
      try {
        const res = await fetch(`/api/dam/batches/${batchId}`);
        if (!res.ok) throw new Error("Status konnte nicht geladen werden.");
        const data = (await res.json()) as { assets: BatchStatusAsset[] };
        if (!cancelled) setAssets(data.assets);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Fehler");
        }
      }
    }

    void load();
    const id = window.setInterval(() => {
      ticks += 1;
      if (ticks > 20) {
        window.clearInterval(id);
        return;
      }
      void load();
    }, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [batchId]);

  const pending = assets.filter((a) => !a.altText && !a.takenAt && a.width == null);

  return (
    <div className="card space-y-4 p-5">
      <div className="flex items-start gap-3">
        <Check className="mt-0.5 size-6 text-emerald-700" aria-hidden />
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
            Batch im Staging
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {assets.length} Bild(er) gespeichert. EXIF und Autotagging laufen im
            Hintergrund
            {pending.length > 0 ? ` (${pending.length} noch offen)` : " — fertig"}.
          </p>
        </div>
      </div>
      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
      <ul className="divide-y divide-[var(--border)]">
        {assets.map((asset) => (
          <li key={asset.id} className="py-3 text-sm">
            <p className="font-semibold">{asset.fileName}</p>
            <p className="mt-1 text-[var(--muted)]">
              {asset.width && asset.height
                ? `${asset.width}×${asset.height}`
                : "Masse folgen…"}
              {asset.takenAt
                ? ` · ${new Date(asset.takenAt).toLocaleString("de-CH")}`
                : " · EXIF folgt…"}
            </p>
            <p className="mt-1 text-[var(--muted)]">
              {asset.altText || "Alt-Text folgt…"}
            </p>
            {asset.keywords.length > 0 ? (
              <p className="mt-1 text-xs text-[var(--muted)]">
                {asset.keywords.join(", ")}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
      <Link href="/dam/personal" className="btn btn-primary inline-flex w-fit">
        Zu meinen Fotos
      </Link>
    </div>
  );
}

export function DamUploadWizard({
  userName,
  recentCredits,
  collections,
}: {
  userName: string;
  recentCredits: string[];
  collections: CollectionOption[];
}) {
  const meCredit = `${userName}/Tsüri.ch`;
  const collectionInputRef = useRef<HTMLInputElement>(null);
  const uploadStateRef = useRef<Record<string, FileUploadState>>({});
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [reached, setReached] = useState(1);
  const [credit, setCredit] = useState("");
  const [creditDraft, setCreditDraft] = useState("");
  const [queued, setQueued] = useState<QueuedFile[]>([]);
  const [dropErrors, setDropErrors] = useState<string[]>([]);
  const [prepared, setPrepared] = useState<PreparedFile[]>([]);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [uploadState, setUploadState] = useState<Record<string, FileUploadState>>(
    {},
  );
  const [showPerFile, setShowPerFile] = useState(false);
  const [rightsType, setRightsType] = useState<RightsType>("provided");
  const [keywords, setKeywords] = useState("");
  const [collectionIds, setCollectionIds] = useState<string[]>([]);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [collectionAuto, setCollectionAuto] = useState(true);
  const [drafts, setDrafts] = useState<AssetDraft[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      queued.forEach((q) => URL.revokeObjectURL(q.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onDrop = useCallback((accepted: File[], rejected: FileRejection[]) => {
    const errors: string[] = [];
    for (const item of rejected) {
      const file = item.file;
      const reason =
        rejectReason(file.name, file.type, file.size) ??
        `«${file.name}» wurde abgelehnt.`;
      errors.push(reason);
    }

    setQueued((prev) => {
      const next = [...prev];
      for (const file of accepted) {
        const reason = rejectReason(file.name, file.type, file.size);
        if (reason) {
          errors.push(reason);
          continue;
        }
        if (next.some((q) => q.file.name === file.name && q.file.size === file.size)) {
          continue;
        }
        next.push({
          id: crypto.randomUUID(),
          file,
          previewUrl: URL.createObjectURL(file),
        });
      }
      if (next.length > MAX_FILES) {
        errors.push(`Maximal ${MAX_FILES} Dateien pro Batch.`);
        const extra = next.slice(MAX_FILES);
        extra.forEach((q) => URL.revokeObjectURL(q.previewUrl));
        setDropErrors(errors);
        return next.slice(0, MAX_FILES);
      }
      setDropErrors(errors);
      return next;
    });
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: true,
    maxSize: MAX_FILE_BYTES,
    disabled: busy || prepared.length > 0,
    accept: {
      "image/jpeg": [".jpg", ".jpeg"],
      "image/png": [".png"],
      "image/webp": [".webp"],
      "image/heic": [".heic", ".heif"],
      "image/heif": [".heic", ".heif"],
    },
    validator: (file) => {
      const reason = rejectReason(file.name, file.type, file.size);
      return reason ? { code: "dam-reject", message: reason } : null;
    },
  });

  const selectedCredit = credit.trim();
  const canContinueCredit = selectedCredit.length > 0;
  const doneCount = prepared.filter(
    (file) => uploadState[file.localId]?.status === "done",
  ).length;
  const failedCount = prepared.filter(
    (file) => uploadState[file.localId]?.status === "error",
  ).length;
  const allUploaded = prepared.length > 0 && doneCount === prepared.length;

  const fileNamesPreview = useMemo(() => {
    if (!selectedCredit || queued.length === 0) return [];
    const date = new Date();
    const pad = (n: number) => String(n).padStart(3, "0");
    const slug = selectedCredit
      .split("/")[0]
      ?.trim()
      .replace(/[Ää]/g, "ae")
      .replace(/[Öö]/g, "oe")
      .replace(/[Üü]/g, "ue")
      .replace(/ß/g, "ss")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "foto";
    const stamp = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Zurich",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .format(date)
      .replace(/-/g, "");
    return queued.map((q, i) => {
      const ext = q.file.name.includes(".")
        ? q.file.name.slice(q.file.name.lastIndexOf(".") + 1).toLowerCase()
        : "jpg";
      return `${slug}-${stamp}-${pad(i + 1)}.${ext}`;
    });
  }, [queued, selectedCredit]);

  function applyCredit(next: string, fromMe: boolean) {
    const trimmed = next.trim();
    setCredit(next);
    setRightsType(suggestedRightsType(trimmed, meCredit));
    if (collectionAuto) {
      setNewCollectionName(trimmed ? defaultCollectionName(trimmed) : "");
    }
    if (fromMe) setCreditDraft("");
  }

  function changeNewCollection(name: string) {
    setCollectionAuto(false);
    setNewCollectionName(name);
  }

  function removeQueued(id: string) {
    setQueued((prev) => {
      const found = prev.find((q) => q.id === id);
      if (found) URL.revokeObjectURL(found.previewUrl);
      return prev.filter((q) => q.id !== id);
    });
  }

  function buildDrafts(files: PreparedFile[]): AssetDraft[] {
    const names = namesFrom(newCollectionName);
    return files.map((file) => ({
      r2Key: file.r2Key,
      sequence: file.sequence,
      fileName: file.fileName,
      originalName: file.clientName,
      contentType: file.contentType,
      size: file.size,
      previewUrl: file.previewUrl,
      rightsType,
      keywords,
      credit: selectedCredit,
      collectionIds,
      newCollections: names,
    }));
  }

  function applyBatchToDrafts() {
    const names = namesFrom(newCollectionName);
    setDrafts((prev) =>
      prev.map((d) => ({
        ...d,
        rightsType,
        keywords,
        collectionIds,
        newCollections: names,
        credit: selectedCredit,
      })),
    );
  }

  function patchUploadState(localId: string, next: FileUploadState) {
    uploadStateRef.current = { ...uploadStateRef.current, [localId]: next };
    setUploadState((prev) => ({ ...prev, [localId]: next }));
  }

  async function uploadOne(file: PreparedFile): Promise<boolean> {
    patchUploadState(file.localId, {
      status: "uploading",
      progress: uploadStateRef.current[file.localId]?.progress ?? 0,
    });
    try {
      await putFile(file.uploadUrl, file.r2Key, file.file, file.contentType, (pct) => {
        patchUploadState(file.localId, { status: "uploading", progress: pct });
      });
      patchUploadState(file.localId, { status: "done", progress: 100 });
      return true;
    } catch (err) {
      patchUploadState(file.localId, {
        status: "error",
        progress: uploadStateRef.current[file.localId]?.progress ?? 0,
        error: err instanceof Error ? err.message : "Upload fehlgeschlagen.",
      });
      return false;
    }
  }

  function allFilesDone(files: PreparedFile[]): boolean {
    return (
      files.length > 0 &&
      files.every((file) => uploadStateRef.current[file.localId]?.status === "done")
    );
  }

  function moveTo(n: 1 | 2 | 3 | 4) {
    setStep(n);
    setReached((current) => Math.max(current, n));
  }

  function goToMetadata(files: PreparedFile[]) {
    setDrafts((prev) => (prev.length === files.length ? prev : buildDrafts(files)));
    moveTo(3);
    window.setTimeout(() => collectionInputRef.current?.focus(), 0);
  }

  async function startUpload() {
    setError(null);
    setBusy(true);
    try {
      let mapped = prepared;
      if (mapped.length === 0) {
        const res = await fetch("/api/dam/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            credit: selectedCredit,
            files: queued.map((q) => ({
              name: q.file.name,
              type: q.file.type,
              size: q.file.size,
            })),
          }),
        });
        const data = (await res.json()) as {
          error?: string;
          batchId?: string;
          files?: Array<{
            clientName: string;
            sequence: number;
            fileName: string;
            r2Key: string;
            uploadUrl: string;
            contentType: string;
          }>;
        };
        if (!res.ok || !data.batchId || !data.files) {
          throw new Error(data.error || "Presigned URLs fehlgeschlagen.");
        }
        mapped = data.files.map((item, index) => {
          const q = queued[index];
          if (!q) throw new Error("Datei-Zuordnung fehlgeschlagen.");
          return {
            localId: q.id,
            clientName: item.clientName,
            sequence: item.sequence,
            fileName: item.fileName,
            r2Key: item.r2Key,
            uploadUrl: item.uploadUrl,
            contentType: item.contentType,
            size: q.file.size,
            previewUrl: q.previewUrl,
            file: q.file,
          };
        });
        setBatchId(data.batchId);
        setPrepared(mapped);
        const initial = Object.fromEntries(
          mapped.map((f) => [f.localId, { status: "waiting" as const, progress: 0 }]),
        );
        setUploadState(initial);
        uploadStateRef.current = initial;
      }

      for (const file of mapped) {
        if (uploadStateRef.current[file.localId]?.status === "done") continue;
        await uploadOne(file);
      }

      if (allFilesDone(mapped)) goToMetadata(mapped);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  async function retryFile(file: PreparedFile) {
    setError(null);
    setBusy(true);
    try {
      await uploadOne(file);
      if (allFilesDone(prepared)) goToMetadata(prepared);
    } finally {
      setBusy(false);
    }
  }

  async function retryFailed() {
    setError(null);
    setBusy(true);
    try {
      const failed = prepared.filter(
        (file) => uploadStateRef.current[file.localId]?.status === "error",
      );
      for (const file of failed) {
        await uploadOne(file);
      }
      if (allFilesDone(prepared)) goToMetadata(prepared);
    } finally {
      setBusy(false);
    }
  }

  async function completeBatch() {
    if (!batchId) return;
    setError(null);
    setBusy(true);
    try {
      const batchNames = namesFrom(newCollectionName);
      const res = await fetch("/api/dam/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batchId,
          applyToAll: !showPerFile,
          rightsType,
          keywords: parseKeywordInput(keywords),
          collectionIds,
          newCollections: batchNames,
          assets: drafts.map((d) => ({
            r2Key: d.r2Key,
            sequence: d.sequence,
            fileName: d.fileName,
            originalName: d.originalName,
            contentType: d.contentType,
            size: d.size,
            rightsType: d.rightsType,
            keywords: parseKeywordInput(d.keywords),
            credit: d.credit,
            collectionIds: d.collectionIds,
            newCollections: d.newCollections,
          })),
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Speichern fehlgeschlagen.");
      moveTo(4);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  function goToStep(n: 1 | 2 | 3) {
    if (n === 1) moveTo(1);
    else if (n === 2 && canContinueCredit) moveTo(2);
    else if (n === 3 && allUploaded) {
      goToMetadata(prepared);
    }
  }

  const steps = [
    { n: 1 as const, label: "Credit", done: reached > 1 },
    { n: 2 as const, label: "Upload", done: reached > 2 },
    { n: 3 as const, label: "Metadaten", done: reached > 3 },
  ];

  return (
    <div className="space-y-6">
      <ol className="flex flex-wrap gap-2 text-sm font-semibold">
        {steps.map((s) => {
          const active = step === s.n || (step === 4 && s.n === 3);
          const clickable = s.n === 1 || (s.n === 2 && canContinueCredit) || (s.n === 3 && allUploaded);
          return (
            <li key={s.n}>
              <button
                type="button"
                disabled={!clickable || step === 4}
                onClick={() => goToStep(s.n)}
                className={[
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1",
                  active
                    ? "bg-[var(--fg)] text-white"
                    : s.done
                      ? "bg-emerald-100 text-emerald-900"
                      : "bg-[var(--panel-muted)] text-[var(--muted)]",
                  clickable && step !== 4 ? "cursor-pointer" : "",
                ].join(" ")}
              >
                {s.done ? <Check className="size-3.5" aria-hidden /> : <span>{s.n}.</span>}
                {s.label}
              </button>
            </li>
          );
        })}
      </ol>

      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-[var(--danger)]" role="alert">
          {error}
        </p>
      ) : null}

      {step === 1 ? (
        <section className="card space-y-4 p-5">
          <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
            Credit / Fotograf:in
          </h2>
          <p className="text-sm text-[var(--muted)]">
            Wird auf alle Bilder dieses Batches gesetzt und für die Dateinamen
            verwendet.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-highlight"
              onClick={() => applyCredit(meCredit, true)}
            >
              <User className="size-4" aria-hidden />
              Ich
            </button>
            <span className="self-center text-sm text-[var(--muted)]">
              setzt «{meCredit}»
            </span>
          </div>
          {recentCredits.length > 0 ? (
            <div className="field">
              <label htmlFor="recent-credit">Zuletzt genutzt</label>
              <select
                id="recent-credit"
                value={recentCredits.includes(credit) ? credit : ""}
                onChange={(e) => {
                  applyCredit(e.target.value, e.target.value === meCredit);
                  setCreditDraft("");
                }}
              >
                <option value="">— wählen —</option>
                {recentCredits.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="field">
            <label htmlFor="credit-free">Oder neuer Credit</label>
            <input
              id="credit-free"
              value={creditDraft}
              onChange={(e) => {
                setCreditDraft(e.target.value);
                applyCredit(e.target.value, false);
              }}
              placeholder="Paul Muster/Tsüri.ch"
            />
          </div>
          {selectedCredit ? (
            <p className="text-sm">
              Aktiv: <strong>{selectedCredit}</strong>
            </p>
          ) : null}
          <button
            type="button"
            className="btn btn-primary"
            disabled={!canContinueCredit}
            onClick={() => moveTo(2)}
          >
            Weiter zum Upload
          </button>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="card space-y-4 p-5">
          <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
            Bilder hochladen
          </h2>
          <p className="text-sm text-[var(--muted)]">
            JPEG, PNG, WebP oder HEIC. RAW-Dateien werden abgelehnt.
          </p>
          {prepared.length > 0 ? (
            <p className="text-sm font-semibold">
              {doneCount} von {prepared.length} hochgeladen
              {failedCount > 0 ? ` · ${failedCount} fehlgeschlagen` : ""}
            </p>
          ) : null}
          {prepared.length === 0 ? (
            <div
              {...getRootProps()}
              className={[
                "cursor-pointer rounded-xl border-2 border-dashed px-4 py-10 text-center transition-colors",
                isDragActive
                  ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                  : "border-[var(--border)] bg-white",
              ].join(" ")}
            >
              <input {...getInputProps()} />
              <Upload className="mx-auto size-8 opacity-70" aria-hidden />
              <p className="mt-3 font-semibold">
                {isDragActive ? "Jetzt loslassen" : "Dateien hierher ziehen oder klicken"}
              </p>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Mehrfachauswahl, max. {MAX_FILES} Dateien / 40 MB
              </p>
            </div>
          ) : null}
          {dropErrors.length > 0 ? (
            <ul className="space-y-1 text-sm text-[var(--danger)]">
              {dropErrors.map((msg) => (
                <li key={msg}>{msg}</li>
              ))}
            </ul>
          ) : null}
          {queued.length > 0 ? (
            <ul className="grid gap-3 sm:grid-cols-2">
              {queued.map((q, i) => {
                const state = uploadState[q.id];
                return (
                  <li
                    key={q.id}
                    className="flex items-center gap-3 rounded-lg border-2 border-[var(--border)] p-2"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={q.previewUrl}
                      alt=""
                      className="size-14 rounded-md object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{q.file.name}</p>
                      <p className="truncate text-xs text-[var(--muted)]">
                        {fileNamesPreview[i]}
                      </p>
                      {state?.status === "waiting" ? (
                        <p className="mt-1 text-xs text-[var(--muted)]">Wartet</p>
                      ) : null}
                      {state?.status === "uploading" ? (
                        <div className="mt-1 flex items-center gap-2">
                          <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--panel-muted)]">
                            <div
                              className="h-full bg-[var(--accent)]"
                              style={{ width: `${state.progress}%` }}
                            />
                          </div>
                          <span className="text-xs tabular-nums">{state.progress}%</span>
                        </div>
                      ) : null}
                      {state?.status === "done" ? (
                        <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                          <Check className="size-3.5" aria-hidden /> hochgeladen
                        </p>
                      ) : null}
                      {state?.status === "error" ? (
                        <div className="mt-1 space-y-1">
                          <p className="text-xs text-[var(--danger)]">
                            ✗ {state.error || "Fehler"}
                          </p>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent)] hover:underline"
                            disabled={busy}
                            onClick={() => {
                              const file = prepared.find((item) => item.localId === q.id);
                              if (file) void retryFile(file);
                            }}
                          >
                            <RotateCw className="size-3" aria-hidden />
                            Erneut versuchen
                          </button>
                        </div>
                      ) : null}
                    </div>
                    {!busy && !state ? (
                      <button
                        type="button"
                        className="text-[var(--muted)] hover:text-[var(--danger)]"
                        onClick={() => removeQueued(q.id)}
                        aria-label="Entfernen"
                      >
                        <X className="size-4" />
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy}
              onClick={() => moveTo(1)}
            >
              Zurück
            </button>
            {allUploaded ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => goToMetadata(prepared)}
              >
                Weiter zu Metadaten
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || queued.length === 0}
                onClick={() => void (failedCount > 0 ? retryFailed() : startUpload())}
              >
                {busy ? (
                  <>
                    <LoaderCircle className="size-4 animate-spin" aria-hidden />
                    Lade zu R2…
                  </>
                ) : failedCount > 0 ? (
                  <>
                    <RotateCw className="size-4" aria-hidden />
                    Fehlgeschlagene erneut versuchen
                  </>
                ) : (
                  <>
                    <ImagePlus className="size-4" aria-hidden />
                    {queued.length} Bild(er) hochladen
                  </>
                )}
              </button>
            )}
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section className="card space-y-5 p-5">
          <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
            Batch-Metadaten
          </h2>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-primary"
              onClick={applyBatchToDrafts}
            >
              Auf alle anwenden
            </button>
            <button
              type="button"
              className={showPerFile ? "btn btn-primary" : "btn btn-ghost"}
              onClick={() => {
                if (!showPerFile) applyBatchToDrafts();
                setShowPerFile(true);
              }}
            >
              Einzeln bearbeiten
            </button>
          </div>
          <MetaFields
            fieldId="batch"
            rightsType={rightsType}
            onRights={(v) => {
              setRightsType(v);
              if (!showPerFile) {
                setDrafts((prev) => prev.map((d) => ({ ...d, rightsType: v })));
              }
            }}
            keywords={keywords}
            onKeywords={(v) => {
              setKeywords(v);
              if (!showPerFile) {
                setDrafts((prev) => prev.map((d) => ({ ...d, keywords: v })));
              }
            }}
            collectionIds={collectionIds}
            onCollectionIds={(ids) => {
              setCollectionIds(ids);
              if (!showPerFile) {
                setDrafts((prev) => prev.map((d) => ({ ...d, collectionIds: ids })));
              }
            }}
            collections={collections}
            newCollectionName={newCollectionName}
            onNewCollectionName={(name) => {
              changeNewCollection(name);
              if (!showPerFile) {
                setDrafts((prev) =>
                  prev.map((d) => ({ ...d, newCollections: namesFrom(name) })),
                );
              }
            }}
            collectionInputRef={collectionInputRef}
            autoFocusCollection
          />
          {showPerFile ? (
            <ul className="space-y-3">
              {drafts.map((draft, index) => (
                <li key={draft.r2Key}>
                  <details
                    open
                    className="rounded-xl border-2 border-[var(--border)] p-4"
                  >
                    <summary className="flex cursor-pointer list-none items-center gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={draft.previewUrl}
                        alt=""
                        className="size-14 rounded-md object-cover"
                      />
                      <div className="min-w-0">
                        <p className="font-semibold">{draft.fileName}</p>
                        <p className="truncate text-xs text-[var(--muted)]">
                          {draft.originalName}
                        </p>
                      </div>
                    </summary>
                    <div className="mt-4">
                      <MetaFields
                        fieldId={`file-${index}`}
                        rightsType={draft.rightsType}
                        onRights={(v) =>
                          setDrafts((prev) =>
                            prev.map((d, i) =>
                              i === index ? { ...d, rightsType: v } : d,
                            ),
                          )
                        }
                        keywords={draft.keywords}
                        onKeywords={(v) =>
                          setDrafts((prev) =>
                            prev.map((d, i) =>
                              i === index ? { ...d, keywords: v } : d,
                            ),
                          )
                        }
                        collectionIds={draft.collectionIds}
                        onCollectionIds={(ids) =>
                          setDrafts((prev) =>
                            prev.map((d, i) =>
                              i === index ? { ...d, collectionIds: ids } : d,
                            ),
                          )
                        }
                        collections={collections}
                        newCollectionName={draft.newCollections[0] ?? ""}
                        onNewCollectionName={(name) =>
                          setDrafts((prev) =>
                            prev.map((d, i) =>
                              i === index
                                ? { ...d, newCollections: namesFrom(name) }
                                : d,
                            ),
                          )
                        }
                        credit={draft.credit}
                        onCredit={(v) =>
                          setDrafts((prev) =>
                            prev.map((d, i) =>
                              i === index ? { ...d, credit: v } : d,
                            ),
                          )
                        }
                        showCredit
                      />
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {prepared.map((file) => (
                <li key={file.r2Key} className="text-xs text-[var(--muted)]">
                  {file.fileName}
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy}
              onClick={() => moveTo(2)}
            >
              Zurück
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() => void completeBatch()}
            >
              {busy ? "Speichert…" : "Batch abschliessen"}
            </button>
          </div>
        </section>
      ) : null}

      {step === 4 && batchId ? <BatchStatus batchId={batchId} /> : null}
    </div>
  );
}
