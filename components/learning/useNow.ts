"use client";

import { useSyncExternalStore } from "react";

// The current time, refreshed when the tab comes back into view and at local
// midnight, so a screen left open overnight shows the new day's plan. null on
// the server: prerendering must not read the clock.
let current: Date | null = null;

function getSnapshot(): Date {
  return (current ??= new Date());
}

function subscribe(listener: () => void): () => void {
  let timer = 0;
  const refresh = () => {
    current = new Date();
    listener();
    schedule();
  };
  const schedule = () => {
    window.clearTimeout(timer);
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
    timer = window.setTimeout(refresh, midnight - now.getTime() + 1000);
  };
  const onVisible = () => document.visibilityState === "visible" && refresh();
  schedule();
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("focus", refresh);
  return () => {
    window.clearTimeout(timer);
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("focus", refresh);
  };
}

export function useNow(): Date | null {
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}
