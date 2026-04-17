const STORAGE_KEY = 'djrequests:requester';
export const MAX_NAME_LENGTH = 200;
export const TTL_MS = 12 * 60 * 60 * 1000;

type StoredRequester = { name: string; savedAt: number };

let probedStorage: Storage | null | undefined;

function safeStorage(): Storage | null {
  if (probedStorage !== undefined) return probedStorage;
  try {
    const storage = window.localStorage;
    const probe = '__djrequests_probe__';
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    probedStorage = storage;
  } catch {
    probedStorage = null;
  }
  return probedStorage;
}

export function loadRequesterName(): string | null {
  const storage = safeStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredRequester>;
    if (typeof parsed?.name !== 'string') return null;
    if (parsed.name.length === 0 || parsed.name.length > MAX_NAME_LENGTH) {
      return null;
    }
    if (!Number.isFinite(parsed.savedAt)) return null;
    if (Date.now() - (parsed.savedAt as number) > TTL_MS) {
      try {
        storage.removeItem(STORAGE_KEY);
      } catch {
        /* silent */
      }
      return null;
    }
    return parsed.name;
  } catch {
    return null;
  }
}

export function saveRequesterName(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > MAX_NAME_LENGTH) return false;
  const storage = safeStorage();
  if (!storage) return false;
  try {
    const payload: StoredRequester = { name: trimmed, savedAt: Date.now() };
    storage.setItem(STORAGE_KEY, JSON.stringify(payload));
    return true;
  } catch {
    /* quota exceeded or similar — nothing was written */
    return false;
  }
}

export function clearRequesterName(): boolean {
  const storage = safeStorage();
  // No storage available → nothing was ever persisted via this module,
  // so the caller's post-condition ("nothing is persisted") already holds.
  if (!storage) return true;
  try {
    storage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    /* removeItem threw — stored value may still be present */
    return false;
  }
}

export function __resetStorageProbeForTests(): void {
  probedStorage = undefined;
}
