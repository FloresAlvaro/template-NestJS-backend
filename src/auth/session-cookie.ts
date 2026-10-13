export const SESSION_COOKIE = 'tienda_session';
export function readSessionToken(cookie?: string): string | undefined {
  const token = (cookie ?? '')
    .split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith(SESSION_COOKIE + '='))
    ?.slice(SESSION_COOKIE.length + 1);
  return token && /^[a-f0-9]{64}$/.test(token) ? token : undefined;
}
