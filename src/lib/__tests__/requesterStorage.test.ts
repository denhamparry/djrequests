import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetStorageProbeForTests,
  clearRequesterName,
  loadRequesterName,
  saveRequesterName,
  TTL_MS
} from '../requesterStorage';

const STORAGE_KEY = 'djrequests:requester';

describe('requesterStorage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    __resetStorageProbeForTests();
  });

  afterEach(() => {
    window.localStorage.clear();
    __resetStorageProbeForTests();
  });

  describe('loadRequesterName', () => {
    it('returns null when storage is empty', () => {
      expect(loadRequesterName()).toBeNull();
    });

    it('returns the stored name after a save', () => {
      saveRequesterName('Avery');
      expect(loadRequesterName()).toBe('Avery');
    });

    it('returns null when stored payload is malformed JSON', () => {
      window.localStorage.setItem(STORAGE_KEY, '{not json');
      expect(loadRequesterName()).toBeNull();
    });

    it('returns null when stored payload has no name', () => {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({}));
      expect(loadRequesterName()).toBeNull();
    });

    it('returns null when stored name is empty string', () => {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ name: '' }));
      expect(loadRequesterName()).toBeNull();
    });

    it('returns null when stored name exceeds the length cap', () => {
      const huge = 'a'.repeat(201);
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ name: huge, savedAt: Date.now() })
      );
      expect(loadRequesterName()).toBeNull();
    });
  });

  describe('TTL', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('returns the stored name when age is below TTL', () => {
      const base = new Date('2026-04-17T20:00:00Z');
      vi.setSystemTime(base);
      saveRequesterName('Avery');
      vi.setSystemTime(new Date(base.getTime() + TTL_MS - 1));
      expect(loadRequesterName()).toBe('Avery');
    });

    it('returns null and removes the entry when age exceeds TTL', () => {
      const base = new Date('2026-04-17T20:00:00Z');
      vi.setSystemTime(base);
      saveRequesterName('Avery');
      vi.setSystemTime(new Date(base.getTime() + TTL_MS + 1));
      expect(loadRequesterName()).toBeNull();
      expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it('returns null for legacy payloads without savedAt', () => {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ name: 'Avery' })
      );
      expect(loadRequesterName()).toBeNull();
    });

    it('returns null when savedAt is not a finite number', () => {
      for (const savedAt of ['yesterday', NaN, Infinity, null]) {
        window.localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ name: 'Avery', savedAt })
        );
        expect(loadRequesterName()).toBeNull();
      }
    });

    it('saveRequesterName stamps savedAt with the current time', () => {
      const base = new Date('2026-04-17T20:00:00Z');
      vi.setSystemTime(base);
      saveRequesterName('Avery');
      const raw = window.localStorage.getItem(STORAGE_KEY);
      expect(raw).not.toBeNull();
      expect(JSON.parse(raw as string)).toEqual({
        name: 'Avery',
        savedAt: base.getTime()
      });
    });
  });

  describe('saveRequesterName', () => {
    it('trims whitespace before storing', () => {
      saveRequesterName('  Bob  ');
      const raw = window.localStorage.getItem(STORAGE_KEY);
      expect(raw).not.toBeNull();
      expect(JSON.parse(raw as string)).toMatchObject({ name: 'Bob' });
    });

    it('is a no-op for empty input', () => {
      saveRequesterName('');
      expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it('is a no-op for whitespace-only input', () => {
      saveRequesterName('   ');
      expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it('is a no-op when input exceeds length cap', () => {
      saveRequesterName('a'.repeat(201));
      expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it('overwrites a previously stored value', () => {
      saveRequesterName('Avery');
      saveRequesterName('Bob');
      expect(loadRequesterName()).toBe('Bob');
    });

    it('silently swallows setItem throwing (quota exceeded, etc.)', () => {
      const originalSetItem = window.localStorage.setItem.bind(
        window.localStorage
      );
      window.localStorage.setItem = () => {
        throw new Error('QuotaExceededError');
      };
      try {
        expect(() => saveRequesterName('Avery')).not.toThrow();
      } finally {
        window.localStorage.setItem = originalSetItem;
      }
    });
  });

  describe('clearRequesterName', () => {
    it('removes the stored value', () => {
      saveRequesterName('Avery');
      expect(loadRequesterName()).toBe('Avery');
      clearRequesterName();
      expect(loadRequesterName()).toBeNull();
    });

    it('is a no-op when nothing is stored', () => {
      expect(() => clearRequesterName()).not.toThrow();
    });
  });

  describe('graceful fallback when localStorage is unavailable', () => {
    let originalDescriptor: PropertyDescriptor | undefined;

    beforeEach(() => {
      originalDescriptor = Object.getOwnPropertyDescriptor(
        window,
        'localStorage'
      );
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get() {
          throw new Error('SecurityError: localStorage disabled');
        }
      });
      __resetStorageProbeForTests();
    });

    afterEach(() => {
      if (originalDescriptor) {
        Object.defineProperty(window, 'localStorage', originalDescriptor);
      }
      __resetStorageProbeForTests();
    });

    it('loadRequesterName returns null without throwing', () => {
      expect(() => loadRequesterName()).not.toThrow();
      expect(loadRequesterName()).toBeNull();
    });

    it('saveRequesterName silently does nothing', () => {
      expect(() => saveRequesterName('Avery')).not.toThrow();
    });

    it('clearRequesterName silently does nothing', () => {
      expect(() => clearRequesterName()).not.toThrow();
    });
  });
});
