import { isConfiguredSecret, loadEnvironment, mark } from './lib.mjs';

const environment = loadEnvironment();
if (!environment) {
  console.error('✗ .env does not exist. Copy .env.example to .env first.');
  process.exitCode = 1;
} else {
  const checks = [
    ['DATABASE_URL', /^(postgresql|postgres):\/\//.test(environment.DATABASE_URL ?? '')],
    ['REDIS_URL', /^rediss?:\/\//.test(environment.REDIS_URL ?? '')],
    ['WEB_URL', /^https?:\/\//.test(environment.WEB_URL ?? '')],
    ['API_URL', /^https?:\/\//.test(environment.API_URL ?? '')],
    ['NEXT_PUBLIC_API_URL', /^https?:\/\//.test(environment.NEXT_PUBLIC_API_URL ?? '')],
    ['GEMINI_API_KEY', isConfiguredSecret(environment.GEMINI_API_KEY)],
    ['YOUTUBE_API_KEY', isConfiguredSecret(environment.YOUTUBE_API_KEY)],
    [
      'JWT_ISSUER (optional)',
      !environment.JWT_ISSUER || /^https?:\/\//.test(environment.JWT_ISSUER),
    ],
    [
      'JWT_AUDIENCE (optional)',
      !environment.JWT_AUDIENCE || Boolean(environment.JWT_AUDIENCE.trim()),
    ],
  ];

  const browserOidcKeys = [
    'NEXT_PUBLIC_OIDC_ISSUER',
    'NEXT_PUBLIC_OIDC_CLIENT_ID',
    'NEXT_PUBLIC_OIDC_AUDIENCE',
    'NEXT_PUBLIC_OIDC_REDIRECT_URI',
  ];
  const browserOidcCount = browserOidcKeys.filter((key) =>
    Boolean(environment[key]?.trim()),
  ).length;
  const browserOidcRequired = environment.NODE_ENV === 'production';
  checks.push([
    browserOidcRequired ? 'Browser OIDC (required)' : 'Browser OIDC (optional)',
    browserOidcCount === 0
      ? !browserOidcRequired
      : browserOidcCount === browserOidcKeys.length,
  ]);

  for (const [name, ok] of checks) console.log(`${mark(Boolean(ok))} ${name}`);
  if (checks.some(([, ok]) => !ok)) {
    console.error(
      '\nConfiguration is incomplete. Values were not printed to protect secrets.',
    );
    process.exitCode = 1;
  } else {
    console.log('\nEnvironment configuration is complete.');
  }
}
