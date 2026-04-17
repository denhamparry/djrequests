import { useCallback, useState } from 'react';
import {
  clearRequesterName,
  loadRequesterName,
  MAX_NAME_LENGTH,
  saveRequesterName
} from '../lib/requesterStorage';

export function useRequesterName() {
  const initial = () => loadRequesterName() ?? '';
  const [name, setName] = useState<string>(initial);
  const [persistedName, setPersistedName] = useState<string | null>(() =>
    loadRequesterName()
  );

  const persist = useCallback((value: string) => {
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > MAX_NAME_LENGTH) return;
    if (saveRequesterName(trimmed)) {
      setPersistedName(trimmed);
    }
  }, []);

  const clear = useCallback(() => {
    const cleared = clearRequesterName();
    setName('');
    if (cleared) {
      setPersistedName(null);
    }
  }, []);

  return { name, setName, persist, clear, persistedName };
}
