const ACCESS_TOKEN_KEY = 'learnmap-oidc-session';
const TRANSACTION_KEY = 'learnmap-oidc-transaction';
const AUTH_EVENT = 'learnmap-auth-change';

type OidcConfiguration = {
  issuer: string;
  clientId: string;
  audience: string;
  redirectUri: string;
};

type ProviderMetadata = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
};

type AuthSession = { accessToken: string; expiresAt: number };
type AuthTransaction = {
  state: string;
  nonce: string;
  codeVerifier: string;
  returnTo: string;
  createdAt: number;
};

const configuration: OidcConfiguration | null =
  process.env.NEXT_PUBLIC_OIDC_ISSUER &&
  process.env.NEXT_PUBLIC_OIDC_CLIENT_ID &&
  process.env.NEXT_PUBLIC_OIDC_AUDIENCE &&
  process.env.NEXT_PUBLIC_OIDC_REDIRECT_URI
    ? {
        issuer: process.env.NEXT_PUBLIC_OIDC_ISSUER.replace(/\/$/, ''),
        clientId: process.env.NEXT_PUBLIC_OIDC_CLIENT_ID,
        audience: process.env.NEXT_PUBLIC_OIDC_AUDIENCE,
        redirectUri: process.env.NEXT_PUBLIC_OIDC_REDIRECT_URI,
      }
    : null;

function randomBase64Url(byteLength: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}

async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}

export function safeReturnPath(value: string): string {
  return value.startsWith('/') && !value.startsWith('//') ? value : '/';
}

function requireHttpsOrLocalhost(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== 'https:' && url.hostname !== 'localhost') {
    throw new Error('OIDC endpoints must use HTTPS outside local development.');
  }
  return url;
}

async function discover(config: OidcConfiguration): Promise<ProviderMetadata> {
  const discoveryUrl = `${config.issuer}/.well-known/openid-configuration`;
  const response = await fetch(requireHttpsOrLocalhost(discoveryUrl), {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('The identity provider is unavailable.');
  const candidate = (await response.json()) as Partial<ProviderMetadata>;
  if (
    candidate.issuer?.replace(/\/$/, '') !== config.issuer ||
    !candidate.authorization_endpoint ||
    !candidate.token_endpoint
  ) {
    throw new Error('The identity provider metadata is invalid.');
  }
  requireHttpsOrLocalhost(candidate.authorization_endpoint);
  requireHttpsOrLocalhost(candidate.token_endpoint);
  return candidate as ProviderMetadata;
}

function notifyAuthChanged(): void {
  window.dispatchEvent(new Event(AUTH_EVENT));
}

export function isOidcConfigured(): boolean {
  return configuration !== null;
}

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  const serialized = window.sessionStorage.getItem(ACCESS_TOKEN_KEY);
  if (!serialized) return null;
  try {
    const session = JSON.parse(serialized) as AuthSession;
    if (
      typeof session.accessToken !== 'string' ||
      session.accessToken.length > 8_192 ||
      typeof session.expiresAt !== 'number' ||
      session.expiresAt <= Date.now() + 30_000
    ) {
      window.sessionStorage.removeItem(ACCESS_TOKEN_KEY);
      return null;
    }
    return session.accessToken;
  } catch {
    window.sessionStorage.removeItem(ACCESS_TOKEN_KEY);
    return null;
  }
}

export async function beginSignIn(returnTo: string): Promise<void> {
  if (!configuration) throw new Error('OIDC is not configured.');
  const metadata = await discover(configuration);
  const transaction: AuthTransaction = {
    state: randomBase64Url(32),
    nonce: randomBase64Url(32),
    codeVerifier: randomBase64Url(64),
    returnTo: safeReturnPath(returnTo),
    createdAt: Date.now(),
  };
  window.sessionStorage.setItem(TRANSACTION_KEY, JSON.stringify(transaction));
  const authorizationUrl = new URL(metadata.authorization_endpoint);
  authorizationUrl.search = new URLSearchParams({
    response_type: 'code',
    client_id: configuration.clientId,
    redirect_uri: configuration.redirectUri,
    scope: 'openid profile email',
    audience: configuration.audience,
    state: transaction.state,
    nonce: transaction.nonce,
    code_challenge: await sha256Base64Url(transaction.codeVerifier),
    code_challenge_method: 'S256',
  }).toString();
  window.location.assign(authorizationUrl);
}

export async function completeSignIn(callbackUrl: string): Promise<string> {
  if (!configuration) throw new Error('OIDC is not configured.');
  const url = new URL(callbackUrl);
  const serialized = window.sessionStorage.getItem(TRANSACTION_KEY);
  window.sessionStorage.removeItem(TRANSACTION_KEY);
  if (!serialized) throw new Error('The sign-in transaction is missing or expired.');
  const transaction = JSON.parse(serialized) as AuthTransaction;
  if (Date.now() - transaction.createdAt > 10 * 60_000) {
    throw new Error('The sign-in transaction expired.');
  }
  if (
    !url.searchParams.get('state') ||
    url.searchParams.get('state') !== transaction.state
  ) {
    throw new Error('The sign-in response could not be verified.');
  }
  const providerError = url.searchParams.get('error');
  if (providerError) throw new Error(`Sign-in was not completed (${providerError}).`);
  const code = url.searchParams.get('code');
  if (!code) throw new Error('The authorization code is missing.');

  const metadata = await discover(configuration);
  const response = await fetch(metadata.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: configuration.clientId,
      redirect_uri: configuration.redirectUri,
      code,
      code_verifier: transaction.codeVerifier,
    }),
  });
  const token = (await response.json().catch(() => null)) as {
    access_token?: unknown;
    expires_in?: unknown;
    token_type?: unknown;
  } | null;
  if (
    !response.ok ||
    typeof token?.access_token !== 'string' ||
    token.access_token.length > 8_192 ||
    token.token_type?.toString().toLowerCase() !== 'bearer'
  ) {
    throw new Error('The identity provider did not issue a usable access token.');
  }
  const expiresIn =
    typeof token.expires_in === 'number' && token.expires_in > 0
      ? Math.min(token.expires_in, 86_400)
      : 3_600;
  const session: AuthSession = {
    accessToken: token.access_token,
    expiresAt: Date.now() + expiresIn * 1_000,
  };
  window.sessionStorage.setItem(ACCESS_TOKEN_KEY, JSON.stringify(session));
  notifyAuthChanged();
  return safeReturnPath(transaction.returnTo);
}

export function signOut(): void {
  window.sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  window.sessionStorage.removeItem(TRANSACTION_KEY);
  notifyAuthChanged();
}

export function subscribeToAuthChanges(listener: () => void): () => void {
  window.addEventListener(AUTH_EVENT, listener);
  return () => window.removeEventListener(AUTH_EVENT, listener);
}
