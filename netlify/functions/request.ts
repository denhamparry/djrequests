import type { Handler } from '@netlify/functions';
import { FORM_FIELD_IDS } from '../../shared/formFields';
import { corsHeaders } from './_cors';
import { checkRateLimit, resolveClientKey } from './_rateLimit';
import { validateRequestBody } from './_validate';

const jsonResponse = (
  statusCode: number,
  payload: Record<string, unknown>,
  extraHeaders: Record<string, string> = {}
) => ({
  statusCode,
  headers: {
    'content-type': 'application/json',
    ...corsHeaders(),
    ...extraHeaders
  },
  body: JSON.stringify(payload)
});

const deriveFormResponseConfig = () => {
  const envUrl = process.env.GOOGLE_FORM_URL ?? process.env.VITE_GOOGLE_FORM_URL;
  if (!envUrl) {
    throw new Error('Google Form URL is not configured. Set GOOGLE_FORM_URL or VITE_GOOGLE_FORM_URL.');
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(envUrl);
  } catch {
    throw new Error('Google Form URL is invalid. Provide a full prefilled link.');
  }

  const responsePath = parsedUrl.pathname.replace(
    /(viewform|prefill)(\/|$)/,
    'formResponse$2'
  );
  const responseUrl = `${parsedUrl.origin}${responsePath}`;

  const defaultParams = new URLSearchParams(parsedUrl.search);
  const fieldIds = Object.values(FORM_FIELD_IDS);
  fieldIds.forEach((fieldId) => defaultParams.delete(fieldId));
  defaultParams.delete('submit');

  return {
    responseUrl,
    defaultParams
  };
};

const appendField = (params: URLSearchParams, fieldId: string, value?: string | null) => {
  if (!fieldId) {
    return;
  }

  params.set(fieldId, value ?? '');
};

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders(),
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  if (!event.body) {
    return jsonResponse(400, { error: 'Missing request body' });
  }

  const clientKey = resolveClientKey(
    (event.headers ?? {}) as Record<string, string | undefined>
  );
  const limit = checkRateLimit(clientKey);
  if (!limit.allowed) {
    return jsonResponse(
      429,
      { error: 'Too many requests. Please wait a moment before trying again.' },
      { 'retry-after': String(limit.retryAfterSeconds) }
    );
  }

  let raw: unknown;

  try {
    raw = JSON.parse(event.body);
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON payload' });
  }

  const validation = validateRequestBody(raw);
  if (!validation.ok) {
    return jsonResponse(400, { error: validation.error });
  }

  const { song, requester } = validation.value;

  let formConfig: ReturnType<typeof deriveFormResponseConfig>;
  try {
    formConfig = deriveFormResponseConfig();
  } catch (configError) {
    console.error('[request] Google Form configuration error:', configError);
    return jsonResponse(500, {
      error: 'Request service is temporarily unavailable.'
    });
  }

  const params = new URLSearchParams(formConfig.defaultParams);
  appendField(params, FORM_FIELD_IDS.trackId, song.id);
  appendField(params, FORM_FIELD_IDS.trackName, song.title);
  appendField(params, FORM_FIELD_IDS.artistName, song.artist);
  appendField(params, FORM_FIELD_IDS.albumName, song.album);
  appendField(params, FORM_FIELD_IDS.artworkUrl, song.artworkUrl);
  appendField(params, FORM_FIELD_IDS.previewUrl, song.previewUrl);
  appendField(params, FORM_FIELD_IDS.requesterName, requester.name);
  appendField(params, FORM_FIELD_IDS.dedication, requester.dedication);
  appendField(params, FORM_FIELD_IDS.contact, requester.contact);
  params.set('submit', 'Submit');

  let response: Response;

  try {
    response = await fetch(formConfig.responseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });
  } catch (networkError) {
    console.error('[request] Google Form network error:', networkError);
    return jsonResponse(502, {
      error: 'Failed to reach the request service.'
    });
  }

  if (!response.ok) {
    return jsonResponse(502, {
      error: `Google Form responded with status ${response.status}`
    });
  }

  return jsonResponse(200, {
    message: 'Song request submitted successfully.'
  });
};
