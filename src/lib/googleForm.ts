import type { Song, Requester } from '../../shared/types';

type RequestResponse = {
  message?: string;
};

export class RequestError extends Error {
  readonly requestId?: string;

  constructor(message: string, requestId?: string) {
    super(message);
    this.name = 'RequestError';
    this.requestId = requestId;
  }
}

export async function submitSongRequest(
  song: Song,
  details: Requester
): Promise<RequestResponse> {
  const response = await fetch('/.netlify/functions/request', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      song,
      requester: details
    })
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMessage =
      typeof payload?.error === 'string' ? payload.error : 'Unable to submit request.';
    const requestId =
      typeof payload?.requestId === 'string' ? payload.requestId : undefined;
    throw new RequestError(errorMessage, requestId);
  }

  return payload;
}
