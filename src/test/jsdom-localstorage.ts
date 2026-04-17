// jsdom 29 + Node 22+ ship an experimental WebStorage backed by a file
// path supplied via --localstorage-file. Without that flag, Node creates a
// Storage object whose prototype methods (clear/setItem/getItem/removeItem)
// are present-but-broken, surfacing as either thrown SecurityError or
// `undefined` method references depending on the codepath.
//
// Replace it with a simple Map-backed shim so tests can use the standard
// Web Storage API without needing the Node flag. Only runs under jsdom.
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
