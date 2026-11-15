"use client";

import { useEffect } from "react";

/** Registers public/sw.js in production builds only. */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Offline shell is a nicety; the app works without it.
    });
  }, []);
  return null;
}
