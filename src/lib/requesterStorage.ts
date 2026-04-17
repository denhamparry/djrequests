const STORAGE_KEY = 'djrequests:requester';
export const MAX_NAME_LENGTH = 200;

type StoredRequester = { name: string };

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
    return parsed.name;
  } catch {
    return null;
  }
}

export function saveRequesterName(name: string): void {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > MAX_NAME_LENGTH) return;
  const storage = safeStorage();
  if (!storage) return;
  try {
    const payload: StoredRequester = { name: trimmed };
    storage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota exceeded or similar — silent fallback */
  }
}

export function clearRequesterName(): void {
  const storage = safeStorage();
  if (!storage) return;
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    /* silent fallback */
  }
}

export function __resetStorageProbeForTests(): void {
  probedStorage = undefined;
}
