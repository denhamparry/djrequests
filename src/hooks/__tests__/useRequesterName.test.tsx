import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useRequesterName } from '../useRequesterName';
import { __resetStorageProbeForTests } from '../../lib/requesterStorage';

const STORAGE_KEY = 'djrequests:requester';

describe('useRequesterName', () => {
  beforeEach(() => {
    window.localStorage.clear();
    __resetStorageProbeForTests();
  });

  afterEach(() => {
    window.localStorage.clear();
    __resetStorageProbeForTests();
  });

  it('initialises name to empty string when storage is empty', () => {
    const { result } = renderHook(() => useRequesterName());
    expect(result.current.name).toBe('');
    expect(result.current.persistedName).toBeNull();
  });

  it('initialises from stored value when present', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ name: 'Avery', savedAt: Date.now() })
    );
    const { result } = renderHook(() => useRequesterName());
    expect(result.current.name).toBe('Avery');
    expect(result.current.persistedName).toBe('Avery');
  });

  it('setName updates state without persisting', () => {
    const { result } = renderHook(() => useRequesterName());
    act(() => result.current.setName('Bob'));
    expect(result.current.name).toBe('Bob');
    expect(result.current.persistedName).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('persist writes to storage and updates persistedName', () => {
    const { result } = renderHook(() => useRequesterName());
    act(() => result.current.persist('Avery'));
    expect(result.current.persistedName).toBe('Avery');
    expect(window.localStorage.getItem(STORAGE_KEY)).not.toBeNull();
  });

  it('persist trims whitespace before storing', () => {
    const { result } = renderHook(() => useRequesterName());
    act(() => result.current.persist('  Bob  '));
    expect(result.current.persistedName).toBe('Bob');
  });

  it('persist is a no-op for empty input', () => {
    const { result } = renderHook(() => useRequesterName());
    act(() => result.current.persist('   '));
    expect(result.current.persistedName).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('clear empties state and removes the stored value', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ name: 'Avery', savedAt: Date.now() })
    );
    const { result } = renderHook(() => useRequesterName());
    expect(result.current.name).toBe('Avery');
    act(() => result.current.clear());
    expect(result.current.name).toBe('');
    expect(result.current.persistedName).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('persist does not update persistedName when setItem throws', () => {
    const { result } = renderHook(() => useRequesterName());
    const originalSetItem = window.localStorage.setItem.bind(
      window.localStorage
    );
    window.localStorage.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    try {
      act(() => result.current.persist('Avery'));
      expect(result.current.persistedName).toBeNull();
    } finally {
      window.localStorage.setItem = originalSetItem;
    }
  });

  it('clear empties name but keeps persistedName when removeItem throws', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ name: 'Avery', savedAt: Date.now() })
    );
    const { result } = renderHook(() => useRequesterName());
    expect(result.current.persistedName).toBe('Avery');

    const originalRemoveItem = window.localStorage.removeItem.bind(
      window.localStorage
    );
    window.localStorage.removeItem = () => {
      throw new Error('SecurityError');
    };
    try {
      act(() => result.current.clear());
      expect(result.current.name).toBe('');
      expect(result.current.persistedName).toBe('Avery');
    } finally {
      window.localStorage.removeItem = originalRemoveItem;
    }
  });
});
