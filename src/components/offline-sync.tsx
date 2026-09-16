"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createOutboxFlusher } from "@/lib/offline/flush";
import { tryCreateOutboxStore } from "@/lib/offline/indexeddb-outbox";
import { submitQueuedCapture, submitQueuedPhoto } from "@/lib/offline/submitters";

/**
 * Drains the offline outbox whenever the phone can reach the server, and
 * tells the roofer what's still waiting.
 *
 * Mounted app-wide rather than on the capture screen, because a visit
 * written up on a roof should sync as soon as he gets reception — whether
 * or not he happens to reopen that visit.
 */
export function OfflineSync() {
  const router = useRouter();
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const flush = useCallback(async () => {
    const store = tryCreateOutboxStore();
    if (!store) return;

    const waiting = await store.listPending();
    setPending(waiting.length);
    if (waiting.length === 0 || !navigator.onLine) return;

    setSyncing(true);
    try {
      const run = createOutboxFlusher(store, {
        submitCapture: submitQueuedCapture,
        submitPhoto: submitQueuedPhoto,
      });
      const result = await run();
      const left = await store.listPending();
      setPending(left.length);
      // Pull the freshly-synced visit into the server-rendered pages.
      if (result.sent > 0) router.refresh();
    } finally {
      setSyncing(false);
    }
  }, [router]);

  useEffect(() => {
    // Deferred rather than called straight from the effect body: the first
    // drain has no reason to block the first paint, and calling it
    // synchronously here would set state mid-render and cascade.
    const initial = setTimeout(() => void flush(), 0);

    const onOnline = () => void flush();
    const onVisible = () => {
      if (document.visibilityState === "visible") void flush();
    };

    window.addEventListener("online", onOnline);
    // iOS Safari evicts storage and suspends pages aggressively; reopening
    // the app is the most reliable moment to catch a pending capture.
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("ridge:outbox-changed", onOnline);

    return () => {
      clearTimeout(initial);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("ridge:outbox-changed", onOnline);
    };
  }, [flush]);

  if (pending === 0) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-16 z-20 mx-auto max-w-md px-4 pb-2"
      role="status"
      aria-live="polite"
    >
      <p className="rounded-field border border-border bg-surface px-3 py-2 text-caption text-muted shadow-card">
        {syncing
          ? `Syncing ${pending} ${pending === 1 ? "item" : "items"}…`
          : `${pending} ${pending === 1 ? "item" : "items"} saved on your phone — will send when you're back online.`}
      </p>
    </div>
  );
}
