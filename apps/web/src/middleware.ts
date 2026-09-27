import createMiddleware from 'next-intl/middleware';
import { NextRequest } from 'next/server';
import { buildContentSecurityPolicy } from './lib/security/content-security-policy';
import { routing } from './i18n/routing';

const internationalizationMiddleware = createMiddleware(routing);

export default function middleware(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const policy = buildContentSecurityPolicy(
    nonce,
    process.env.NODE_ENV === 'development' ? 'development' : 'production',
  );
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', policy);
  const securedRequest = new NextRequest(request, { headers: requestHeaders });
  const response = internationalizationMiddleware(securedRequest);
  response.headers.set('Content-Security-Policy', policy);
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  return response;
}

export const config = {
  matcher: '/((?!api|_next|_vercel|.*\\..*).*)',
};
