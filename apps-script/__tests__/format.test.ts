import { describe, expect, it } from 'vitest';
import { buildDocEntry } from '../format';

describe('buildDocEntry', () => {
  it('formats metadata for the Google Doc playlist', () => {
    const entry = buildDocEntry({
      trackId: '321',
      trackName: 'Digital Love',
      artistName: 'Daft Punk',
      albumName: 'Discovery',
      requesterName: 'Avery',
      dedication: 'To the dancefloor crew!',
      contact: 'instagram.com/avery',
      submittedAtIso: '2025-10-02T19:30:00.000Z'
    });

    expect(entry.heading).toBe('Digital Love (ID: 321)');
    expect(entry.metadata).toEqual([
      { label: 'Artist', value: 'Daft Punk' },
      { label: 'Album', value: 'Discovery' },
      { label: 'Requested by', value: 'Avery' },
      { label: 'Dedication', value: 'To the dancefloor crew!' },
      { label: 'Contact', value: 'instagram.com/avery' },
      { label: 'Requested at', value: '2 Oct 2025, 20:30' }
    ]);
  });

  it('falls back to safe defaults when optional fields are missing', () => {
    const entry = buildDocEntry({
      trackId: '111',
      trackName: 'Unknown Track',
      artistName: 'Mystery Artist',
      albumName: null,
      requesterName: null,
      dedication: null,
      contact: null,
      submittedAtIso: 'Invalid Date'
    });

    expect(entry.heading).toBe('Unknown Track (ID: 111)');
    expect(entry.metadata).toEqual([
      { label: 'Artist', value: 'Mystery Artist' },
      { label: 'Album', value: '—' },
      { label: 'Requested by', value: 'Guest' },
      { label: 'Dedication', value: '—' },
      { label: 'Contact', value: '—' },
      { label: 'Requested at', value: 'Invalid Date' }
    ]);
  });
});
