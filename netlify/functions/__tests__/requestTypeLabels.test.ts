import { describe, expect, it } from 'vitest';
import { REQUEST_TYPES, REQUEST_TYPE_LABELS } from '../../../shared/types';

describe('REQUEST_TYPE_LABELS', () => {
  it('has a non-empty label for every REQUEST_TYPES value', () => {
    for (const type of REQUEST_TYPES) {
      const label = REQUEST_TYPE_LABELS[type];
      expect(label).toBeTruthy();
      expect(label.trim()).toBe(label);
    }
  });

  // These exact values MUST match the multiple-choice option text on the
  // Google Form. Changing them breaks live form submission, so pin them.
  it('maps to the exact Google Form option text', () => {
    expect(REQUEST_TYPE_LABELS).toEqual({
      song: 'Song',
      karaoke: 'Karaoke'
    });
  });

  it('has no extra keys beyond REQUEST_TYPES', () => {
    expect(Object.keys(REQUEST_TYPE_LABELS).sort()).toEqual(
      [...REQUEST_TYPES].sort()
    );
  });
});
