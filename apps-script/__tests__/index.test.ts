// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { getGoogleDocId } from '../index';

type PropertiesServiceShape = {
  getScriptProperties(): { getProperty(key: string): string | null };
};

const globalWithProps = globalThis as unknown as {
  PropertiesService?: PropertiesServiceShape;
};

function stubProperties(value: string | null): void {
  globalWithProps.PropertiesService = {
    getScriptProperties: () => ({
      getProperty: (key: string) => (key === 'GOOGLE_DOC_ID' ? value : null)
    })
  };
}

describe('getGoogleDocId', () => {
  afterEach(() => {
    delete globalWithProps.PropertiesService;
  });

  it('returns the configured Doc ID when the Script Property is set', () => {
    stubProperties('doc-abc-123');
    expect(getGoogleDocId()).toBe('doc-abc-123');
  });

  it('throws a descriptive error when the Script Property is missing', () => {
    stubProperties(null);
    expect(() => getGoogleDocId()).toThrow(/GOOGLE_DOC_ID/);
  });

  it('treats a whitespace-only property as missing', () => {
    stubProperties('   ');
    expect(() => getGoogleDocId()).toThrow(/GOOGLE_DOC_ID/);
  });
});
