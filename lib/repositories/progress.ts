// Student progress storage. The browser's Storage is passed in, so this module
// never touches window and runs in tests with a stand-in.
import { LocalProgress, LocalProgressV1 } from "@/lib/schema/progress";

export interface ProgressRepository {
  load(): LocalProgress;
  save(progress: LocalProgress): void;
  // False when progress lives only in memory (no storage, or writes failing).
  readonly persistent: boolean;
}

export function emptyProgress(): LocalProgress {
  return { schemaVersion: 2, profile: null, cards: [], days: {}, lessons: {}, skills: {}, shortages: [] };
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
    if (result.success) return result.data;
    const v1 = LocalProgressV1.safeParse(parsed);
    if (!v1.success) return this.reset(raw);
    // Stage 6 progress: keep words and days, start learning state empty.
    const migrated: LocalProgress = { ...v1.data, schemaVersion: 2, lessons: {}, skills: {}, shortages: [] };
    this.save(migrated);
    return migrated;
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
