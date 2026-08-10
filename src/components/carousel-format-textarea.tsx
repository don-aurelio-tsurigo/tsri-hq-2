"use client";

import {
  useRef,
  type ChangeEvent,
  type ReactNode,
  type RefObject,
  type TextareaHTMLAttributes,
} from "react";

type FormatTag = "b" | "i";

function wrapOrUnwrap(
  value: string,
  start: number,
  end: number,
  tag: FormatTag,
): { value: string; selectionStart: number; selectionEnd: number } {
  const open = `<${tag}>`;
  const close = `</${tag}>`;
  const selected = value.slice(start, end);

  // Unwrap if marks sit just outside the selection
  if (
    start >= open.length &&
    value.slice(start - open.length, start) === open &&
    value.slice(end, end + close.length) === close
  ) {
    return {
      value:
        value.slice(0, start - open.length) +
        selected +
        value.slice(end + close.length),
      selectionStart: start - open.length,
      selectionEnd: end - open.length,
    };
  }

  // Unwrap if selection itself includes the marks
  if (
    selected.startsWith(open) &&
    selected.endsWith(close) &&
    selected.length >= open.length + close.length
  ) {
    const inner = selected.slice(open.length, -close.length);
    return {
      value: value.slice(0, start) + inner + value.slice(end),
      selectionStart: start,
      selectionEnd: start + inner.length,
    };
  }

  return {
    value: value.slice(0, start) + open + selected + close + value.slice(end),
    selectionStart: start + open.length,
    selectionEnd: end + open.length,
  };
}

function applyFormat(
  textarea: HTMLTextAreaElement,
  value: string,
  tag: FormatTag,
  onChange: (next: string) => void,
) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const next = wrapOrUnwrap(value, start, end, tag);
  onChange(next.value);
  requestAnimationFrame(() => {
    textarea.focus();
    textarea.setSelectionRange(next.selectionStart, next.selectionEnd);
  });
}

function ToolbarButton({
  label,
  title,
  disabled,
  onClick,
}: {
  label: ReactNode;
  title: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      className="btn btn-ghost min-w-9 px-2 py-1 text-sm font-semibold disabled:opacity-50"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

export function CarouselFormatTextarea({
  value,
  onChange,
  disabled,
  placeholder,
  className,
  rows,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  rows?: number;
  label?: string;
} & Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "value" | "onChange" | "disabled" | "placeholder" | "className" | "rows"
>) {
  const ref = useRef<HTMLTextAreaElement>(null);

  function format(tag: FormatTag) {
    const el = ref.current;
    if (!el || disabled) return;
    applyFormat(el, value, tag, onChange);
  }

  return (
    <div className="space-y-2">
      {label ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-medium">{label}</span>
          <div className="flex items-center gap-1">
            <ToolbarButton
              label={<span className="font-bold">B</span>}
              title="Fett (Auswahl)"
              disabled={disabled}
              onClick={() => format("b")}
            />
            <ToolbarButton
              label={<span className="italic">I</span>}
              title="Kursiv (Auswahl)"
              disabled={disabled}
              onClick={() => format("i")}
            />
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-1">
          <ToolbarButton
            label={<span className="font-bold">B</span>}
            title="Fett (Auswahl)"
            disabled={disabled}
            onClick={() => format("b")}
          />
          <ToolbarButton
            label={<span className="italic">I</span>}
            title="Kursiv (Auswahl)"
            disabled={disabled}
            onClick={() => format("i")}
          />
        </div>
      )}
      <textarea
        ref={ref as RefObject<HTMLTextAreaElement>}
        className={className ?? "min-h-48 w-full font-mono text-sm"}
        disabled={disabled}
        value={value}
        rows={rows}
        placeholder={placeholder}
        onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
          onChange(e.target.value)
        }
      />
    </div>
  );
}
