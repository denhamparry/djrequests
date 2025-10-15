import type { Handler } from '@netlify/functions';
import { FORM_FIELD_IDS } from '../../shared/formFields';

type SongPayload = {
  id: string;
  title: string;
  artist: string;
  album?: string | null;
  artworkUrl?: string | null;
  previewUrl?: string | null;
};

type RequesterPayload = {
  name?: string;
  dedication?: string;
  contact?: string;
};

type RequestBody = {
  song?: SongPayload;
  requester?: RequesterPayload;
};

const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST,OPTIONS',
  'access-control-allow-headers': 'Content-Type'
};

const jsonResponse = (statusCode: number, payload: Record<string, unknown>) => ({
  statusCode,
  headers: {
    'content-type': 'application/json',
    ...corsHeaders
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
      headers: corsHeaders,
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  if (!event.body) {
    return jsonResponse(400, { error: 'Missing request body' });
  }

  let payload: RequestBody;

  try {
    payload = JSON.parse(event.body);
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON payload' });
  }

  if (!payload.song) {
    return jsonResponse(400, { error: 'Song information is required' });
  }

  const formConfig = (() => {
    try {
      return deriveFormResponseConfig();
    } catch (configError) {
      return configError;
    }
  })();

  if (formConfig instanceof Error) {
    return jsonResponse(500, { error: formConfig.message });
  }

  const params = new URLSearchParams(formConfig.defaultParams);
  appendField(params, FORM_FIELD_IDS.trackId, payload.song.id);
  appendField(params, FORM_FIELD_IDS.trackName, payload.song.title);
  appendField(params, FORM_FIELD_IDS.artistName, payload.song.artist);
  appendField(params, FORM_FIELD_IDS.albumName, payload.song.album ?? '');
  appendField(params, FORM_FIELD_IDS.artworkUrl, payload.song.artworkUrl ?? '');
  appendField(params, FORM_FIELD_IDS.previewUrl, payload.song.previewUrl ?? '');
  appendField(params, FORM_FIELD_IDS.requesterName, payload.requester?.name ?? '');
  appendField(params, FORM_FIELD_IDS.dedication, payload.requester?.dedication ?? '');
  appendField(params, FORM_FIELD_IDS.contact, payload.requester?.contact ?? '');
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
    return jsonResponse(502, {
      error: `Failed to submit to Google Form: ${
        networkError instanceof Error ? networkError.message : 'Unknown error'
      }`
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
