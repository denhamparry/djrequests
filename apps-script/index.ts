import { buildDocEntry, type SongRequestSubmission } from "./format";

type ParagraphHeading = 0 | 1 | 2 | 3 | 4 | 5 | 6;

type DocParagraph = {
  setHeading(heading: ParagraphHeading): DocParagraph;
  setBold(isBold: boolean): DocParagraph;
};

type DocBody = {
  appendParagraph(text: string): DocParagraph;
  appendHorizontalRule(): void;
};

type SheetsOnFormSubmitEvent = {
  namedValues: Record<string, string[]>;
};

type ScriptProperties = {
  getProperty(key: string): string | null;
};

declare const DocumentApp: {
  openById(docId: string): { getBody(): DocBody };
};

declare const PropertiesService: {
  getScriptProperties(): ScriptProperties;
};

/**
 * Convert form submission data into a Google Doc entry.
 * This logic is separated from Apps Script to enable unit testing.
 */
export function appendSubmissionToDoc(
  body: DocBody,
  submission: SongRequestSubmission,
) {
  const entry = buildDocEntry(submission);
  const heading = body.appendParagraph(entry.heading);
  heading.setHeading(2).setBold(true);

  entry.metadata.forEach(({ label, value }) => {
    body.appendParagraph(`${label}: ${value}`);
  });

  body.appendHorizontalRule();
}

export function getGoogleDocId(): string {
  const id = PropertiesService.getScriptProperties().getProperty(
    "GOOGLE_DOC_ID"
  );
  if (!id || !id.trim()) {
    throw new Error(
      "Script Property 'GOOGLE_DOC_ID' is not set. Set it via Apps Script " +
        "Project Settings → Script Properties, using the ID from the target " +
        "Doc URL (/d/{ID}/edit)."
    );
  }
  return id;
}

/**
 * Apps Script entry point. Wire this to the Google Form submit trigger.
 * Convert namedValues to the submission payload and append it to the doc.
 */
export function onFormSubmit(event: SheetsOnFormSubmitEvent) {
  const namedValues = event.namedValues;
  const body = DocumentApp.openById(getGoogleDocId()).getBody();

  const submission: SongRequestSubmission = {
    trackId: namedValues["Track ID"]?.[0] ?? "",
    trackName: namedValues["Track Name"]?.[0] ?? "Unknown Track",
    artistName: namedValues["Artist Name"]?.[0] ?? "Unknown Artist",
    albumName: namedValues["Album Name"]?.[0] ?? null,
    requesterName: namedValues["Requester Name"]?.[0] ?? null,
    requestType: namedValues["Request type"]?.[0] ?? null,
    contact: namedValues["Contact"]?.[0] ?? null,
    submittedAtIso: new Date().toISOString(),
  };

  appendSubmissionToDoc(body, submission);
}
