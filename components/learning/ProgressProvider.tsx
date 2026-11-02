"use client";

// Browser side of the progress repository. One store per tab, read through
// useSyncExternalStore so the server render and hydration see "not loaded yet"
// (null) and the client then reads localStorage.
import { useSyncExternalStore } from "react";
import { LocalStorageProgressRepository, type ProgressRepository } from "@/lib/repositories/progress";
import type { LocalProgress } from "@/lib/schema/progress";

export interface ProgressState {
  progress: LocalProgress;
  // False when progress cannot be saved in this browser (see Review Focus 1).
  persistent: boolean;
}

let repository: ProgressRepository | null = null;
let snapshot: ProgressState | null = null;
const listeners = new Set<() => void>();

function repo(): ProgressRepository {
  if (!repository) {
    let storage: Storage | null = null;
    try {
      storage = window.localStorage;
    } catch {
      // Blocked storage (privacy settings) throws on access.
    }
    repository = new LocalStorageProgressRepository(storage);
  }
  return repository;
}

function getSnapshot(): ProgressState {
  if (!snapshot) {
    const progress = repo().load();
    snapshot = { progress, persistent: repo().persistent };
  }
  return snapshot;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function updateProgress(change: (progress: LocalProgress) => LocalProgress): void {
  const progress = change(getSnapshot().progress);
  repo().save(progress);
  snapshot = { progress, persistent: repo().persistent };
  for (const listener of listeners) listener();
}

// null until the browser has read the stored progress.
export function useProgress(): ProgressState | null {
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}

export function NotSavedNotice({ persistent }: { persistent: boolean }) {
  if (persistent) return null;
  return (
    <p role="status" className="rounded-md bg-muted px-3 py-2 text-caption text-muted-foreground">
      이 브라우저에서는 진도가 저장되지 않습니다. 창을 닫으면 오늘 기록이 사라집니다.
    </p>
  );
}
