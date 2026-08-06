"use client";

import { useEffect } from "react";

/** Registers the minimal service worker (installability only). */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    const register = async () => {
      try {
        await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      } catch (err) {
        console.warn("[pwa] service worker registration failed", err);
      }
    };

    void register();
  }, []);

  return null;
}
