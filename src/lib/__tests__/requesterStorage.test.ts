import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  __resetStorageProbeForTests,
  clearRequesterName,
  loadRequesterName,
  saveRequesterName
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
        JSON.stringify({ name: huge })
      );
      expect(loadRequesterName()).toBeNull();
    });
  });

  describe('saveRequesterName', () => {
    it('trims whitespace before storing', () => {
      saveRequesterName('  Bob  ');
      const raw = window.localStorage.getItem(STORAGE_KEY);
      expect(raw).not.toBeNull();
      expect(JSON.parse(raw as string)).toEqual({ name: 'Bob' });
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
