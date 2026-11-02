// Student progress storage. The browser's Storage is passed in, so this module
// never touches window and runs in tests with a stand-in.
import { LocalProgress } from "@/lib/schema/progress";

export interface ProgressRepository {
  load(): LocalProgress;
  save(progress: LocalProgress): void;
  // False when progress lives only in memory (no storage, or writes failing).
  readonly persistent: boolean;
}

export function emptyProgress(): LocalProgress {
  return { schemaVersion: 1, profile: null, cards: [], days: {} };
}

export class LocalStorageProgressRepository implements ProgressRepository {
  private memory: LocalProgress | null = null;
  private writable: boolean;

  constructor(
    private readonly storage: Storage | null,
    private readonly key = "english90.progress",
  ) {
    this.writable = storage !== null;
  }

  get persistent(): boolean {
    return this.writable;
  }

  load(): LocalProgress {
    if (this.memory) return this.memory;
    const raw = this.read();
    if (raw === null) return emptyProgress();
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return this.reset(raw);
    }
    const result = LocalProgress.safeParse(parsed);
    return result.success ? result.data : this.reset(raw);
  }

  save(progress: LocalProgress): void {
    if (this.writable && this.storage) {
      try {
        this.storage.setItem(this.key, JSON.stringify(progress));
        return;
      } catch {
        this.writable = false;
      }
    }
    this.memory = progress;
  }

  private read(): string | null {
    try {
      return this.storage?.getItem(this.key) ?? null;
    } catch {
      this.writable = false;
      return null;
    }
  }

  // Keep the unreadable data under a backup key, then start over.
  private reset(raw: string): LocalProgress {
    try {
      this.storage?.setItem(`${this.key}.corrupt.${new Date().toISOString()}`, raw);
      this.storage?.removeItem(this.key);
    } catch {
      this.writable = false;
    }
    return emptyProgress();
  }
}
