import { describe, expect, it } from "vitest";
import type { LocalProgress } from "@/lib/schema/progress";
import { emptyProgress, LocalStorageProgressRepository } from "./progress";

const KEY = "english90.progress";

// Minimal Storage stand-in; `failWrites` simulates a full or blocked store.
function fakeStorage(initial: Record<string, string> = {}, failWrites = false) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    storage: {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => {
        if (failWrites) throw new DOMException("full", "QuotaExceededError");
        data.set(k, v);
      },
      removeItem: (k: string) => void data.delete(k),
      clear: () => data.clear(),
      key: (i: number) => [...data.keys()][i] ?? null,
      get length() {
        return data.size;
      },
    } as Storage,
  };
}

const saved: LocalProgress = {
  ...emptyProgress(),
  profile: { anonId: "0b7e9c1e-2f4a-4c1d-9a8b-1c2d3e4f5a6b", nickname: "학생", dailyMinutes: 15, createdAt: "2026-11-02T09:00:00+09:00" },
  days: { "2026-11-02": { reviewed: 1, learned: 2 } },
};

describe("LocalStorageProgressRepository", () => {
  it("starts empty when nothing is stored", () => {
    const repo = new LocalStorageProgressRepository(fakeStorage().storage);
    expect(repo.load()).toEqual(emptyProgress());
    expect(repo.persistent).toBe(true);
  });

  it("round-trips saved progress", () => {
    const { storage } = fakeStorage();
    new LocalStorageProgressRepository(storage).save(saved);
    expect(new LocalStorageProgressRepository(storage).load()).toEqual(saved);
  });

  it.each([
    ["text that is not JSON", "{not json"],
    ["data that fails the schema", JSON.stringify({ schemaVersion: 1, profile: 5 })],
    ["an older or newer schema version", JSON.stringify({ ...saved, schemaVersion: 2 })],
  ])("backs up %s and starts over", (_label, raw) => {
    const { storage, data } = fakeStorage({ [KEY]: raw });
    const repo = new LocalStorageProgressRepository(storage);
    expect(repo.load()).toEqual(emptyProgress());
    const backups = [...data.keys()].filter((k) => k.startsWith(`${KEY}.corrupt.`));
    expect(backups).toHaveLength(1);
    expect(data.get(backups[0])).toBe(raw);
    expect(data.has(KEY)).toBe(false);
  });

  it("keeps working in memory when there is no storage", () => {
    const repo = new LocalStorageProgressRepository(null);
    expect(repo.persistent).toBe(false);
    repo.save(saved);
    expect(repo.load()).toEqual(saved);
  });

  it("switches to memory instead of throwing when writes fail", () => {
    const repo = new LocalStorageProgressRepository(fakeStorage({}, true).storage);
    expect(() => repo.save(saved)).not.toThrow();
    expect(repo.persistent).toBe(false);
    expect(repo.load()).toEqual(saved);
  });
});
