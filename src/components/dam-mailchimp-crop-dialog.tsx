"use client";

import { useState } from "react";
import { X } from "lucide-react";
import ReactCrop, {
  centerCrop,
  makeAspectCrop,
  type PercentCrop,
} from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { damFileSrc, type DamEditParams } from "@/lib/dam/edit-params";

function initialSquareCrop(width: number, height: number): PercentCrop {
  return centerCrop(
    makeAspectCrop({ unit: "%", width: 90 }, 1, width, height),
    width,
    height,
  );
}

export function DamMailchimpCropDialog({
  assetId,
  fileName,
  editParams,
  onClose,
  onDownloaded,
}: {
  assetId: string;
  fileName: string;
  editParams: DamEditParams;
  onClose: () => void;
  onDownloaded?: () => void;
}) {
  const [crop, setCrop] = useState<PercentCrop>({
    unit: "%",
    x: 5,
    y: 5,
    width: 90,
    height: 90,
  });
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    if (pending) return;
    if (!crop.width || !crop.height) {
      setError("Bitte einen Ausschnitt wählen.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/dam/assets/${assetId}/mailchimp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          crop: {
            unit: "%",
            x: crop.x,
            y: crop.y,
            width: crop.width,
            height: crop.height,
          },
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error || "Mailchimp-Export fehlgeschlagen.");
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = /filename\*=UTF-8''([^;]+)|filename="([^"]+)"/i.exec(
        disposition,
      );
      const rawName = match?.[1]
        ? decodeURIComponent(match[1])
        : match?.[2] || fileName.replace(/\.[^.]+$/, "") + "-mailchimp-800.jpg";
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = rawName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
      onDownloaded?.();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Mailchimp-Export fehlgeschlagen.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dam-mailchimp-crop-title"
      onClick={onClose}
    >
      <div
        className="card flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] p-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-wide text-[var(--accent)] uppercase">
              Mailchimp
            </p>
            <h2
              id="dam-mailchimp-crop-title"
              className="mt-0.5 font-[family-name:var(--font-display)] text-lg font-semibold"
            >
              800×800 Ausschnitt
            </h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Quadrat wählen — Export als JPEG 800×800 px.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-ghost shrink-0 px-2"
            aria-label="Schliessen"
            onClick={onClose}
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-[#111] p-4">
          <ReactCrop
            crop={crop}
            aspect={1}
            keepSelection
            ruleOfThirds
            onChange={(_, percent) => setCrop(percent)}
            className="mx-auto max-w-full"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={damFileSrc(assetId, "web", editParams)}
              alt=""
              className="max-h-[55vh] max-w-full object-contain"
              onLoad={(event) => {
                const { naturalWidth, naturalHeight } = event.currentTarget;
                if (naturalWidth && naturalHeight) {
                  setCrop(initialSquareCrop(naturalWidth, naturalHeight));
                  setReady(true);
                }
              }}
            />
          </ReactCrop>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--border)] p-4">
          {error ? (
            <p className="mr-auto text-sm text-red-600">{error}</p>
          ) : null}
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={pending}>
            Abbrechen
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={pending || !ready}
            onClick={() => void download()}
          >
            {pending ? "Exportiert…" : "800×800 herunterladen"}
          </button>
        </div>
      </div>
    </div>
  );
}
