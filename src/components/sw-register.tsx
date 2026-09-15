"use client";

import { useEffect } from "react";

/**
 * Registers the service worker that lets the app load with no reception
 * (public/sw.js). Mounted once in the roofer layout.
 *
 * Skipped in development: Turbopack's dev bundles aren't content-hashed
 * the way a production build's are, and a service worker caching them
 * makes hot reload behave in ways that waste an afternoon.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        // A roofer without a service worker still has a working app — he
        // just loses the offline shell, so this must never be fatal.
        console.error("Service worker registration failed", err);
      });
    };

    if (document.readyState === "complete") register();
    else {
      window.addEventListener("load", register);
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
