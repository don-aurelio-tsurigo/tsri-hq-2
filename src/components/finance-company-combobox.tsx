"use client";

import { useId, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import type { CompanyInput, CompanyOption } from "@/lib/finance/companies";
import { companyNameKey, normalizeCompanyName } from "@/lib/finance/shared";

const MAX_RESULTS = 8;

/**
 * Pick an organisation from the list or create a new one by typing its name.
 * With `name`, hidden inputs `${name}Id` / `${name}Name` are rendered for
 * plain <form action> usage.
 */
export function FinanceCompanyCombobox({
  companies,
  value,
  onChange,
  inputId,
  name,
  placeholder = "Organisation suchen oder neu eingeben",
  allowCreate = true,
}: {
  companies: CompanyOption[];
  value: CompanyInput;
  onChange: (value: CompanyInput) => void;
  inputId?: string;
  name?: string;
  placeholder?: string;
  /** false: only existing organisations can be picked */
  allowCreate?: boolean;
}) {
  const listId = useId();
  const [text, setText] = useState(value?.name ?? "");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const query = companyNameKey(text);
  const exact = query ? companies.find((c) => companyNameKey(c.name) === query) : undefined;
  const matches = useMemo(() => {
    if (!query) return companies.slice(0, MAX_RESULTS);
    const hits = companies.filter((c) => companyNameKey(c.name).includes(query));
    hits.sort((a, b) => {
      const as = companyNameKey(a.name).startsWith(query) ? 0 : 1;
      const bs = companyNameKey(b.name).startsWith(query) ? 0 : 1;
      return as - bs || a.name.localeCompare(b.name, "de");
    });
    return hits.slice(0, MAX_RESULTS);
  }, [companies, query]);

  const showCreate = allowCreate && !!query && !exact;
  const optionCount = matches.length + (showCreate ? 1 : 0);

  function choose(company: CompanyOption) {
    setText(company.name);
    setOpen(false);
    onChange({ id: company.id, name: company.name });
  }

  function createNew() {
    const normalized = normalizeCompanyName(text);
    setText(normalized);
    setOpen(false);
    onChange(normalized ? { id: null, name: normalized } : null);
  }

  /** Typed text without explicit choice: reuse an exact match, else treat as new. */
  function commitText() {
    setOpen(false);
    if (!query) {
      onChange(null);
      return;
    }
    if (exact) choose(exact);
    else if (!allowCreate) {
      setText(value?.name ?? "");
    } else if (value?.name !== normalizeCompanyName(text) || value?.id) createNew();
  }

  function pick(index: number) {
    if (index < matches.length) choose(matches[index]);
    else if (showCreate) createNew();
  }

  return (
    <div className="relative">
      {name ? (
        <>
          <input type="hidden" name={`${name}Id`} value={value?.id ?? ""} />
          <input type="hidden" name={`${name}Name`} value={value?.name ?? ""} />
        </>
      ) : null}
      <div className="relative">
        <input
          id={inputId}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          value={text}
          placeholder={placeholder}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
            setHighlight(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={commitText}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setHighlight((h) => Math.min(h + 1, Math.max(optionCount - 1, 0)));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlight((h) => Math.max(h - 1, 0));
            } else if (e.key === "Enter" && open && optionCount > 0) {
              e.preventDefault();
              pick(highlight);
            } else if (e.key === "Escape" && open) {
              e.stopPropagation();
              setOpen(false);
            }
          }}
          className="w-full pr-8"
        />
        {text ? (
          <button
            type="button"
            tabIndex={-1}
            aria-label="Organisation entfernen"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setText("");
              onChange(null);
            }}
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-[var(--muted)] hover:text-[var(--fg)]"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>

      {open && optionCount > 0 ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border-2 border-[var(--border)] bg-[var(--bg-elevated)] py-1 text-sm shadow-lg"
        >
          {matches.map((c, i) => (
            <li
              key={c.id}
              role="option"
              aria-selected={i === highlight}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(c)}
              onMouseEnter={() => setHighlight(i)}
              className={[
                "cursor-pointer px-3 py-1.5",
                i === highlight ? "bg-[var(--accent-soft)]" : "",
                c.id === value?.id ? "font-semibold" : "",
              ].join(" ")}
            >
              {c.name}
            </li>
          ))}
          {showCreate ? (
            <li
              role="option"
              aria-selected={highlight === matches.length}
              onMouseDown={(e) => e.preventDefault()}
              onClick={createNew}
              onMouseEnter={() => setHighlight(matches.length)}
              className={[
                "flex cursor-pointer items-center gap-1.5 border-t border-[var(--border)]/60 px-3 py-1.5 font-semibold text-[var(--accent-hover)]",
                highlight === matches.length ? "bg-[var(--accent-soft)]" : "",
              ].join(" ")}
            >
              <Plus className="size-3.5" /> «{normalizeCompanyName(text)}» neu anlegen
            </li>
          ) : null}
        </ul>
      ) : null}

      {value && !value.id ? (
        <p className="mt-1 text-xs text-[var(--muted)]">Wird beim Speichern als neue Organisation angelegt.</p>
      ) : null}
    </div>
  );
}

/** Self-contained variant for server-action forms (submits `${name}Id` / `${name}Name`). */
export function FinanceCompanyField({
  companies,
  name,
  inputId,
}: {
  companies: CompanyOption[];
  name: string;
  inputId?: string;
}) {
  const [value, setValue] = useState<CompanyInput>(null);
  return (
    <FinanceCompanyCombobox
      companies={companies}
      value={value}
      onChange={setValue}
      name={name}
      inputId={inputId}
    />
  );
}
