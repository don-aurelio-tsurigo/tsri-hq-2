"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  FlipHorizontal,
  FlipVertical,
  RotateCcw,
  RotateCw,
  Undo2,
} from "lucide-react";
import { useHotkeys } from "react-hotkeys-hook";
import ReactCrop, { centerCrop, makeAspectCrop, type PercentCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import {
  aspectRatioValue,
  cssFilter,
  cssTransform,
  DAM_ASPECT_PRESETS,
  DEFAULT_EDIT_PARAMS,
  joinRotate,
  parseEditParams,
  rotatedBoundingBox,
  splitRotate,
  type DamAspectRatio,
  type DamEditParams,
} from "@/lib/dam/edit-params";

const ASPECT_LABELS: Record<Exclude<DamAspectRatio, null>, string> = {
  free: "Frei",
  "1:1": "1:1",
  "16:9": "16:9",
  "4:3": "4:3",
  "3:2": "3:2",
};

function toPercentCrop(params: DamEditParams): PercentCrop {
  if (params.crop) return params.crop;
  return { unit: "%", x: 0, y: 0, width: 100, height: 100 };
}

function Slider({
  label,
  value,
  min,
  max,
  unit = "%",
  defaultValue,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  unit?: string;
  defaultValue: number;
  onChange: (n: number) => void;
}) {
  const dirty = value !== defaultValue;
  const formatted =
    unit === "°" && value > 0 ? `+${value}${unit}` : `${value}${unit}`;
  return (
    <label className="block">
      <span className="flex items-center justify-between gap-2 text-sm font-semibold">
        <span>{label}</span>
        <span className="flex items-center gap-1">
          <span className="tabular-nums text-[var(--muted)]">{formatted}</span>
          {dirty ? (
            <button
              type="button"
              className="rounded p-0.5 text-[var(--muted)] hover:text-[var(--fg)]"
              aria-label={`${label} zurücksetzen`}
              onClick={() => onChange(defaultValue)}
            >
              <Undo2 className="size-3.5" />
            </button>
          ) : null}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full"
      />
    </label>
  );
}

function IconToggle({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={pressed ? "btn btn-primary px-2" : "btn btn-ghost px-2"}
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function DamAssetEditor({
  fileName,
  imageSrc,
  initial,
  pending,
  onClose,
  onSave,
}: {
  fileName: string;
  imageSrc: string;
  initial: DamEditParams;
  pending: boolean;
  onClose: () => void;
  onSave: (params: DamEditParams) => void;
}) {
  const [draft, setDraft] = useState<DamEditParams>(() => parseEditParams(initial));
  const [natural, setNatural] = useState({ width: 0, height: 0 });
  const [compare, setCompare] = useState(false);
  const crop = useMemo(() => toPercentCrop(draft), [draft]);
  const preview = compare ? DEFAULT_EDIT_PARAMS : draft;
  const { straighten } = splitRotate(draft.rotate);
  const aspect = compare ? undefined : aspectRatioValue(draft.aspectRatio);

  const stage = useMemo(() => {
    if (natural.width <= 0 || natural.height <= 0) {
      return { boxW: 0, boxH: 0, imgW: 0, imgH: 0 };
    }
    const { quarter } = splitRotate(preview.rotate);
    const box = rotatedBoundingBox(natural.width, natural.height, quarter);
    const fit = Math.min(720 / box.width, 520 / box.height, 1);
    return {
      boxW: box.width * fit,
      boxH: box.height * fit,
      imgW: natural.width * fit,
      imgH: natural.height * fit,
    };
  }, [natural.height, natural.width, preview.rotate]);

  function rememberSize(img: HTMLImageElement) {
    if (!img.naturalWidth) return;
    setNatural((prev) =>
      prev.width === img.naturalWidth && prev.height === img.naturalHeight
        ? prev
        : { width: img.naturalWidth, height: img.naturalHeight },
    );
  }

  function setCropFromPercent(percent: PercentCrop) {
    setDraft((prev) => ({
      ...prev,
      crop: {
        unit: "%",
        x: percent.x,
        y: percent.y,
        width: percent.width,
        height: percent.height,
      },
    }));
  }

  function applyAspect(ratio: DamAspectRatio) {
    const nextRatio = ratio === "free" ? "free" : ratio;
    if (!nextRatio || nextRatio === "free") {
      setDraft((prev) => ({ ...prev, aspectRatio: "free" }));
      return;
    }
    const value = aspectRatioValue(nextRatio);
    if (!value || stage.boxW <= 0 || stage.boxH <= 0) {
      setDraft((prev) => ({ ...prev, aspectRatio: nextRatio }));
      return;
    }
    const next = centerCrop(
      makeAspectCrop({ unit: "%", width: 90 }, value, stage.boxW, stage.boxH),
      stage.boxW,
      stage.boxH,
    );
    setDraft((prev) => ({
      ...prev,
      aspectRatio: nextRatio,
      crop: {
        unit: "%",
        x: next.x,
        y: next.y,
        width: next.width,
        height: next.height,
      },
    }));
  }

  const transform = cssTransform(preview, natural);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dam-editor-title"
    >
      <div className="card max-h-[92vh] w-full max-w-6xl overflow-y-auto p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2
              id="dam-editor-title"
              className="font-[family-name:var(--font-display)] text-xl font-semibold"
            >
              Editor
            </h2>
            <p className="mt-1 text-sm text-[var(--muted)]">{fileName}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={compare ? "btn btn-primary" : "btn btn-ghost"}
              aria-pressed={compare}
              onPointerDown={() => setCompare(true)}
              onPointerUp={() => setCompare(false)}
              onPointerCancel={() => setCompare(false)}
              onPointerLeave={() => setCompare(false)}
              onBlur={() => setCompare(false)}
              onContextMenu={(e) => e.preventDefault()}
            >
              Vorher
            </button>
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={pending}>
              Schliessen
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1">
              {DAM_ASPECT_PRESETS.map((ratio) => {
                const active =
                  ratio === "free"
                    ? !draft.aspectRatio || draft.aspectRatio === "free"
                    : draft.aspectRatio === ratio;
                return (
                  <button
                    key={ratio}
                    type="button"
                    className={active ? "btn btn-primary px-2 text-xs" : "btn btn-ghost px-2 text-xs"}
                    onClick={() => applyAspect(ratio)}
                  >
                    {ASPECT_LABELS[ratio]}
                  </button>
                );
              })}
            </div>
            <div className="flex min-h-[20rem] items-center justify-center overflow-hidden rounded-xl bg-black/80 p-3">
              {compare ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imageSrc}
                  alt=""
                  className="max-h-[65vh] max-w-full object-contain"
                />
              ) : (
                <ReactCrop
                  crop={crop}
                  aspect={aspect}
                  keepSelection
                  onChange={(_pixel, percent) => setCropFromPercent(percent)}
                >
                  <div
                    className="relative overflow-hidden"
                    style={{
                      width: stage.boxW || undefined,
                      height: stage.boxH || undefined,
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={imageSrc}
                      alt=""
                      onLoad={(e) => rememberSize(e.currentTarget)}
                      ref={(el) => {
                        if (el) rememberSize(el);
                      }}
                      style={{
                        position: stage.boxW ? "absolute" : "static",
                        left: "50%",
                        top: "50%",
                        width: stage.imgW || undefined,
                        height: stage.imgH || undefined,
                        maxHeight: stage.boxW ? undefined : "65vh",
                        maxWidth: stage.boxW ? undefined : "100%",
                        filter: cssFilter(preview),
                        transform: stage.boxW
                          ? `translate(-50%, -50%) ${transform ?? ""}`.trim()
                          : transform,
                        transformOrigin: "center center",
                      }}
                    />
                  </div>
                </ReactCrop>
              )}
            </div>
            <p className="text-xs text-[var(--muted)]">
              Vorher gedrückt halten. Begradigen zoomt automatisch, damit keine
              Ecken entstehen.
            </p>
          </div>

          <div className="space-y-4">
            <p className="text-sm text-[var(--muted)]">
              Non-destruktiv: Werte liegen in <code>editParams</code>, das Original bleibt.
            </p>

            <div>
              <p className="mb-2 text-sm font-semibold">Ausrichtung</p>
              <div className="flex flex-wrap gap-1">
                <IconToggle
                  label="90° nach links"
                  onClick={() =>
                    setDraft((p) => ({ ...p, rotate: (p.rotate + 270) % 360 }))
                  }
                >
                  <RotateCcw className="size-4" />
                </IconToggle>
                <IconToggle
                  label="90° nach rechts"
                  onClick={() =>
                    setDraft((p) => ({ ...p, rotate: (p.rotate + 90) % 360 }))
                  }
                >
                  <RotateCw className="size-4" />
                </IconToggle>
                <IconToggle
                  label="Horizontal spiegeln"
                  pressed={draft.flipHorizontal}
                  onClick={() =>
                    setDraft((p) => ({ ...p, flipHorizontal: !p.flipHorizontal }))
                  }
                >
                  <FlipHorizontal className="size-4" />
                </IconToggle>
                <IconToggle
                  label="Vertikal spiegeln"
                  pressed={draft.flipVertical}
                  onClick={() =>
                    setDraft((p) => ({ ...p, flipVertical: !p.flipVertical }))
                  }
                >
                  <FlipVertical className="size-4" />
                </IconToggle>
              </div>
            </div>

            <Slider
              label="Begradigen"
              value={straighten}
              min={-45}
              max={45}
              unit="°"
              defaultValue={0}
              onChange={(value) =>
                setDraft((p) => {
                  const { quarter } = splitRotate(p.rotate);
                  return { ...p, rotate: joinRotate(quarter, value) };
                })
              }
            />
            <Slider
              label="Helligkeit"
              value={draft.brightness}
              min={50}
              max={200}
              defaultValue={100}
              onChange={(brightness) => setDraft((p) => ({ ...p, brightness }))}
            />
            <Slider
              label="Sättigung"
              value={draft.saturation}
              min={50}
              max={200}
              defaultValue={100}
              onChange={(saturation) => setDraft((p) => ({ ...p, saturation }))}
            />
            <Slider
              label="Kontrast"
              value={draft.contrast}
              min={50}
              max={200}
              defaultValue={100}
              onChange={(contrast) => setDraft((p) => ({ ...p, contrast }))}
            />
            <Slider
              label="Schärfe"
              value={draft.sharpen}
              min={0}
              max={100}
              defaultValue={0}
              onChange={(sharpen) => setDraft((p) => ({ ...p, sharpen }))}
            />
            <Slider
              label="Temperatur"
              value={draft.temperature}
              min={-100}
              max={100}
              defaultValue={0}
              onChange={(temperature) => setDraft((p) => ({ ...p, temperature }))}
            />
            <button
              type="button"
              className="btn btn-ghost w-full"
              onClick={() => setDraft({ ...DEFAULT_EDIT_PARAMS })}
            >
              Alles zurücksetzen
            </button>
            <button
              type="button"
              className="btn btn-primary w-full"
              disabled={pending}
              onClick={() => onSave(parseEditParams(draft))}
            >
              {pending ? "Speichert…" : "Speichern"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
