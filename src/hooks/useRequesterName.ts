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
    saveRequesterName(trimmed);
    setPersistedName(trimmed);
  }, []);

  const clear = useCallback(() => {
    clearRequesterName();
    setPersistedName(null);
    setName('');
  }, []);

  return { name, setName, persist, clear, persistedName };
}
