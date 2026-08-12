"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

const DEFAULT_DURATION_MS = 7000;

type ToastAction = {
  label: string;
  onClick: () => void | Promise<void>;
};

type ToastItem = {
  id: string;
  message: string;
  durationMs: number;
  action?: ToastAction;
};

type ShowToastOptions = {
  message: string;
  durationMs?: number;
  action?: ToastAction;
};

type ToastContextValue = {
  showToast: (options: ShowToastOptions) => string;
  dismissToast: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

let toastId = 0;
function nextId() {
  toastId += 1;
  return `toast-${toastId}`;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<string, number>());

  const dismissToast = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (options: ShowToastOptions) => {
      const id = nextId();
      const durationMs = options.durationMs ?? DEFAULT_DURATION_MS;
      setToasts((prev) => [
        ...prev,
        {
          id,
          message: options.message,
          durationMs,
          action: options.action,
        },
      ]);
      const timer = window.setTimeout(() => dismissToast(id), durationMs);
      timers.current.set(id, timer);
      return id;
    },
    [dismissToast],
  );

  useEffect(() => {
    const activeTimers = timers.current;
    return () => {
      for (const timer of activeTimers.values()) {
        window.clearTimeout(timer);
      }
      activeTimers.clear();
    };
  }, []);

  const value = useMemo(
    () => ({ showToast, dismissToast }),
    [showToast, dismissToast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 px-4 pb-6"
        aria-live="polite"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="pointer-events-auto flex max-w-md items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 text-sm shadow-[0_8px_30px_rgba(0,0,0,0.12)]"
            role="status"
          >
            <p className="min-w-0 flex-1 font-medium text-[var(--fg)]">
              {toast.message}
            </p>
            {toast.action && (
              <button
                type="button"
                className="shrink-0 font-semibold text-[var(--accent)] hover:underline"
                onClick={async () => {
                  await toast.action?.onClick();
                  dismissToast(toast.id);
                }}
              >
                {toast.action.label}
              </button>
            )}
            <button
              type="button"
              className="shrink-0 text-[var(--muted)] hover:text-[var(--fg)]"
              aria-label="Schliessen"
              onClick={() => dismissToast(toast.id)}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return ctx;
}
