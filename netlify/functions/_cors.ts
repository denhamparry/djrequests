export const resolveAllowedOrigin = (): string =>
  process.env.ALLOWED_ORIGIN ?? process.env.URL ?? '*';

export const corsHeaders = (): Record<string, string> => ({
  'access-control-allow-origin': resolveAllowedOrigin(),
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'Content-Type'
});
