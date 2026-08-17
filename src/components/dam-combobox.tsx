"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";

export type DamComboboxOption = { value: string; label: string };

export function DamCombobox({
  id,
  label,
  placeholder = "Suchen…",
  emptyLabel = "Alle",
  options,
  value,
  multiple = false,
  onChange,
  remote = false,
  onSearch,
  placement = "bottom",
}: {
  id: string;
  label: string;
  placeholder?: string;
  emptyLabel?: string;
  options: DamComboboxOption[];
  value: string[];
  multiple?: boolean;
  onChange: (next: string[]) => void;
  remote?: boolean;
  onSearch?: (q: string) => Promise<DamComboboxOption[]>;
  placement?: "bottom" | "top";
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [remoteOptions, setRemoteOptions] = useState<DamComboboxOption[] | null>(
    null,
  );
  const [searching, setSearching] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const typed = query.trim();

  const selected = useMemo(() => {
    const map = new Map(options.map((option) => [option.value, option]));
    return value.map(
      (item) => map.get(item) ?? { value: item, label: item },
    );
  }, [options, value]);

  const filtered = useMemo(() => {
    const source = remote && typed ? (remoteOptions ?? []) : options;
    const q = typed.toLocaleLowerCase("de-CH");
    const rows =
      !q || (remote && typed)
        ? source
        : source.filter(
            (option) =>
              option.label.toLocaleLowerCase("de-CH").includes(q) ||
              option.value.toLocaleLowerCase("de-CH").includes(q),
          );
    const missing = selected.filter(
      (item) => !rows.some((row) => row.value === item.value),
    );
    return [...missing, ...rows];
  }, [options, remote, remoteOptions, selected, typed]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setRemoteOptions(null);
    setSearching(false);
    setActiveIndex(0);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) close();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKey);
    const frame = window.requestAnimationFrame(() => searchRef.current?.focus());
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKey);
      window.cancelAnimationFrame(frame);
    };
  }, [close, open]);

  useEffect(() => {
    if (!open || !remote || !onSearch || !typed) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setSearching(true);
      void onSearch(typed).then((rows) => {
        if (cancelled) return;
        setRemoteOptions(rows);
        setSearching(false);
        setActiveIndex(0);
      });
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [onSearch, open, remote, typed]);

  function toggle(nextValue: string) {
    if (multiple) {
      onChange(
        value.includes(nextValue)
          ? value.filter((item) => item !== nextValue)
          : [...value, nextValue],
      );
      return;
    }
    onChange(nextValue === value[0] ? [] : [nextValue]);
    close();
  }

  function triggerLabel() {
    if (multiple) return selected.length ? "" : emptyLabel;
    return selected[0]?.label ?? emptyLabel;
  }

  return (
    <div className="field min-w-0" ref={rootRef}>
      <label htmlFor={id}>{label}</label>
      <div className="relative">
        <div
          id={id}
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          tabIndex={0}
          className="flex min-h-[2.7rem] w-full cursor-pointer items-center gap-1 rounded-[var(--radius-sm)] border-2 border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1.5 text-left font-medium hover:border-[var(--fg)]"
          onClick={() => (open ? close() : setOpen(true))}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              if (open) close();
              else setOpen(true);
            }
          }}
        >
          <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
            {multiple && selected.length > 0
              ? selected.map((item) => (
                  <span
                    key={item.value}
                    className="inline-flex max-w-full items-center gap-1 rounded-full bg-[var(--panel-muted)] px-2 py-0.5 text-xs font-semibold"
                  >
                    <span className="truncate">{item.label}</span>
                    <button
                      type="button"
                      aria-label={`${item.label} entfernen`}
                      className="shrink-0 text-[var(--muted)] hover:text-[var(--fg)]"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onChange(value.filter((v) => v !== item.value));
                      }}
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))
              : (
                  <span
                    className={
                      selected.length ? "truncate" : "truncate text-[var(--muted)]"
                    }
                  >
                    {triggerLabel()}
                  </span>
                )}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-[var(--muted)]" />
        </div>

        {open ? (
          <div
            className={[
              "absolute z-30 w-full min-w-[16rem] overflow-hidden rounded-[var(--radius)] border-2 border-[var(--border)] bg-[var(--bg-elevated)] shadow-[var(--shadow)]",
              placement === "top" ? "bottom-full mb-1" : "mt-1",
            ].join(" ")}
          >
            <div className="border-b-2 border-[var(--border)] p-2">
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActiveIndex(0);
                }}
                placeholder={placeholder}
                aria-autocomplete="list"
                aria-controls={listId}
                className="w-full rounded-[var(--radius-sm)] border-2 border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setActiveIndex((prev) =>
                      filtered.length === 0 ? 0 : (prev + 1) % filtered.length,
                    );
                  } else if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setActiveIndex((prev) =>
                      filtered.length === 0
                        ? 0
                        : (prev - 1 + filtered.length) % filtered.length,
                    );
                  } else if (event.key === "Enter") {
                    event.preventDefault();
                    const option = filtered[activeIndex];
                    if (option) toggle(option.value);
                  }
                }}
              />
            </div>
            <ul
              id={listId}
              role="listbox"
              aria-multiselectable={multiple || undefined}
              className="max-h-56 overflow-y-auto p-1"
            >
              {!multiple ? (
                <li>
                  <button
                    type="button"
                    role="option"
                    aria-selected={value.length === 0}
                    className={[
                      "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm",
                      value.length === 0
                        ? "bg-[var(--highlight)]"
                        : "hover:bg-[var(--panel-muted)]",
                    ].join(" ")}
                    onClick={() => {
                      onChange([]);
                      close();
                    }}
                  >
                    <Check
                      className={[
                        "size-3.5 shrink-0",
                        value.length === 0 ? "opacity-100" : "opacity-0",
                      ].join(" ")}
                    />
                    {emptyLabel}
                  </button>
                </li>
              ) : null}
              {filtered.map((option, index) => {
                const isOn = value.includes(option.value);
                return (
                  <li key={option.value}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isOn}
                      className={[
                        "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm",
                        index === activeIndex ? "bg-[var(--accent-soft)]" : "",
                        isOn ? "font-semibold" : "",
                        "hover:bg-[var(--panel-muted)]",
                      ].join(" ")}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => toggle(option.value)}
                    >
                      <Check
                        className={[
                          "size-3.5 shrink-0",
                          isOn ? "opacity-100" : "opacity-0",
                        ].join(" ")}
                      />
                      <span className="truncate">{option.label}</span>
                    </button>
                  </li>
                );
              })}
              {searching && typed ? (
                <li className="px-3 py-2 text-sm text-[var(--muted)]">Suche…</li>
              ) : filtered.length === 0 ? (
                <li className="px-3 py-2 text-sm text-[var(--muted)]">
                  {remote && typed
                    ? "Keine Treffer. Weiter tippen sucht serverseitig."
                    : "Keine Treffer."}
                </li>
              ) : null}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
