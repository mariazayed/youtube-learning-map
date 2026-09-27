function origin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.hostname === 'localhost'
      ? parsed.origin
      : null;
  } catch {
    return null;
  }
}

export function buildContentSecurityPolicy(
  nonce: string,
  environment: 'development' | 'production' | 'test',
): string {
  const connections = [
    origin(process.env.NEXT_PUBLIC_API_URL),
    origin(process.env.NEXT_PUBLIC_OIDC_ISSUER),
    origin(process.env.NEXT_PUBLIC_SENTRY_DSN),
  ].filter((value): value is string => value !== null);
  const developmentScript = environment === 'development' ? " 'unsafe-eval'" : '';
  const upgrade = environment === 'production' ? '; upgrade-insecure-requests' : '';

  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://www.youtube.com${developmentScript}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://i.ytimg.com https://img.youtube.com",
    "font-src 'self' data:",
    `connect-src 'self' ${connections.join(' ')}`.trim(),
    'frame-src https://www.youtube-nocookie.com https://www.youtube.com',
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    `manifest-src 'self'${upgrade}`,
  ].join('; ');
}
