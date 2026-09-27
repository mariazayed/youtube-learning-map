import process from 'node:process';
import {
  checkTcp,
  commandVersion,
  endpointFromUrl,
  isConfiguredSecret,
  loadEnvironment,
  mark,
} from './lib.mjs';

const includeServices = process.argv.includes('--services');
const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok, detail });

function invokedPnpmVersion() {
  const match = /(?:^|\s)pnpm\/(?<version>\S+)/u.exec(
    process.env.npm_config_user_agent ?? '',
  );
  return match?.groups?.version;
}

const nodeMajor = Number(process.versions.node.split('.')[0]);
add('Node.js 24', nodeMajor === 24, process.versions.node);

const pnpmVersion = invokedPnpmVersion() ?? commandVersion('pnpm');
add(
  'pnpm 11.19.0',
  pnpmVersion === '11.19.0',
  pnpmVersion === '11.19.0'
    ? pnpmVersion
    : `${pnpmVersion ?? 'not found'}; run: corepack enable && corepack install --global pnpm@11.19.0`,
);
add('Git', Boolean(commandVersion('git')), commandVersion('git') ?? 'not found');

const dockerVersion = commandVersion('docker');
add(
  'Docker',
  Boolean(dockerVersion),
  dockerVersion ??
    'not found; install/start Docker Desktop and enable WSL integration for Ubuntu',
);
const composeVersion = commandVersion('docker', ['compose', 'version']);
add(
  'Docker Compose',
  Boolean(composeVersion),
  composeVersion ??
    'not found; install/start Docker Desktop with the Compose plugin enabled',
);

const environment = loadEnvironment();
add('.env file', Boolean(environment), environment ? 'found' : 'missing');
if (environment) {
  add('API URL', /^https?:\/\//.test(environment.API_URL ?? ''), 'format check');
  add(
    'PostgreSQL URL',
    /^(postgresql|postgres):\/\//.test(environment.DATABASE_URL ?? ''),
    'format check',
  );
  add(
    'Valkey/Redis URL',
    /^rediss?:\/\//.test(environment.REDIS_URL ?? ''),
    'format check',
  );
  add(
    'Gemini credential',
    isConfiguredSecret(environment.GEMINI_API_KEY),
    'presence check only',
  );
  add(
    'YouTube credential',
    isConfiguredSecret(environment.YOUTUBE_API_KEY),
    'presence check only',
  );

  if (includeServices) {
    try {
      const database = endpointFromUrl(environment.DATABASE_URL ?? '', 5432);
      add(
        'PostgreSQL connection',
        await checkTcp(database.host, database.port),
        `${database.host}:${database.port}`,
      );
    } catch {
      add('PostgreSQL connection', false, 'invalid URL');
    }
    try {
      const redis = endpointFromUrl(environment.REDIS_URL ?? '', 6379);
      add(
        'Valkey/Redis connection',
        await checkTcp(redis.host, redis.port),
        `${redis.host}:${redis.port}`,
      );
    } catch {
      add('Valkey/Redis connection', false, 'invalid URL');
    }
  }
}

console.log('LearnMap development environment\n');
for (const check of checks) {
  console.log(`${mark(check.ok)} ${check.name.padEnd(24)} ${check.detail}`);
}
const failed = checks.filter((check) => !check.ok);
console.log(
  failed.length === 0
    ? '\nAll checks passed.'
    : `\n${failed.length} check(s) require attention.`,
);
if (failed.length > 0) process.exitCode = 1;
