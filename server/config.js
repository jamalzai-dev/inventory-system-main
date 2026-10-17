export function readServerConfig(env = process.env) {
  const portText = env.PORT ?? '8080';
  if (!/^\d+$/.test(portText) || Number(portText) > 65535) {
    throw new Error('PORT must be an integer between 0 and 65535 (0 chooses an available port).');
  }
  const secret = env.SESSION_SECRET;
  if (!secret || Buffer.byteLength(secret.trim()) < 32 || /replace|change.me/i.test(secret)) {
    throw new Error('SESSION_SECRET must contain at least 32 bytes of randomly generated secret text.');
  }
  const production = env.NODE_ENV === 'production';
  if (env.TRUST_PROXY && !['0', '1'].includes(env.TRUST_PROXY)) throw new Error('TRUST_PROXY must be 0 or 1.');
  let origin;
  if (env.APP_ORIGIN) {
    try {
      const parsed = new URL(env.APP_ORIGIN);
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) throw new Error();
      origin = parsed.origin;
    } catch { throw new Error('APP_ORIGIN must be the public HTTP(S) origin without credentials, path, query or fragment.'); }
  }
  if (production && !origin?.startsWith('https://')) throw new Error('Production requires an HTTPS APP_ORIGIN.');
  return { port: Number(portText), secret, origin, secure: production || origin?.startsWith('https://') === true, trustProxy: env.TRUST_PROXY === '1' };
}
