export type SongRequestSubmission = {
  trackId: string;
  trackName: string;
  artistName: string;
  albumName?: string | null;
  requesterName?: string | null;
  dedication?: string | null;
  contact?: string | null;
  submittedAtIso: string;
};

export type DocEntry = {
  heading: string;
  metadata: Array<{ label: string; value: string }>;
};

export function buildDocEntry(submission: SongRequestSubmission): DocEntry {
  const submittedAt = new Date(submission.submittedAtIso);
  const formattedTimestamp = !Number.isNaN(submittedAt.getTime())
    ? submittedAt.toLocaleString('en-GB', {
        dateStyle: 'medium',
        timeStyle: 'short'
      })
    : submission.submittedAtIso;

  const metadata: DocEntry['metadata'] = [
    { label: 'Artist', value: submission.artistName },
    { label: 'Album', value: submission.albumName ?? '—' },
    { label: 'Requested by', value: submission.requesterName ?? 'Guest' },
    { label: 'Dedication', value: submission.dedication ?? '—' },
    { label: 'Contact', value: submission.contact ?? '—' },
    { label: 'Requested at', value: formattedTimestamp }
  ];

  return {
    heading: `${submission.trackName} (ID: ${submission.trackId})`,
    metadata
  };
}
