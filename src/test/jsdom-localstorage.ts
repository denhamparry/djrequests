// Under jsdom 29 in this project's Vitest setup, `window.localStorage`
// is present but its Storage methods (clear / setItem / getItem /
// removeItem) are not callable in the test codepath — the symptom of
// issue #35 and the reason tests blew up on localStorage access here.
// Setting `jsdom.url` in vite.config avoids the opaque-origin
// SecurityError but does not restore the methods.
//
// Install a Map-backed shim satisfying the standard `Storage`
// interface so tests can use the Web Storage API regardless of what
// the host environment provides. Only runs under jsdom.
function createStorage(): Storage {
  const store = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? (store.get(key) as string) : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(String(key), String(value));
    }
  };
  return storage;
}

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: createStorage()
  });
  Object.defineProperty(window, 'sessionStorage', {
    configurable: true,
    value: createStorage()
  });
}
