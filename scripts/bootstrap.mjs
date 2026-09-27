import { copyFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import {
  commandVersion,
  endpointFromUrl,
  envPath,
  isConfiguredSecret,
  loadEnvironment,
  rootDirectory,
  run,
  waitForTcp,
} from './lib.mjs';

function execute(command, args, extra = {}) {
  const result = run(command, args, { stdio: 'inherit', ...extra });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const skipInfrastructure = process.argv.includes('--skip-infra');
const nodeMajor = Number(process.versions.node.split('.')[0]);
if (nodeMajor !== 24) {
  console.error(`Node.js 24 is required. Current version: ${process.versions.node}`);
  process.exit(1);
}

const pnpmVersion = commandVersion('pnpm');
if (pnpmVersion !== '11.19.0') {
  console.log(`Activating pnpm 11.19.0 (current: ${pnpmVersion ?? 'not installed'})…`);
  execute('corepack', ['enable']);
  execute('corepack', ['install', '--global', 'pnpm@11.19.0']);
}

if (!existsSync(envPath)) {
  copyFileSync(resolve(rootDirectory, '.env.example'), envPath);
  console.log('Created .env from .env.example.');
}

console.log('Installing exact workspace dependencies…');
execute('pnpm', ['install', '--frozen-lockfile']);

if (!skipInfrastructure) {
  if (!commandVersion('docker') || !commandVersion('docker', ['compose', 'version'])) {
    console.error(
      'Docker with Compose is required. Install Docker Desktop, then rerun setup.',
    );
    process.exit(1);
  }
  console.log('Starting PostgreSQL and Valkey…');
  execute('node', ['scripts/infra.mjs', 'up']);

  const environment = loadEnvironment();
  const database = endpointFromUrl(environment?.DATABASE_URL ?? '', 5432);
  const redis = endpointFromUrl(environment?.REDIS_URL ?? '', 6379);
  const [databaseReady, redisReady] = await Promise.all([
    waitForTcp(database.host, database.port),
    waitForTcp(redis.host, redis.port),
  ]);
  if (!databaseReady || !redisReady) {
    console.error(
      'Local services did not become ready in time. Run pnpm doctor:services.',
    );
    process.exit(1);
  }

  console.log('Applying database migrations…');
  execute('pnpm', ['--filter', '@learnmap/database', 'db:deploy'], {
    env: { ...process.env, ...environment },
  });
}

const environment = loadEnvironment();
const missingCredentials = [
  ['GEMINI_API_KEY', environment?.GEMINI_API_KEY],
  ['YOUTUBE_API_KEY', environment?.YOUTUBE_API_KEY],
].filter(([, value]) => !isConfiguredSecret(value));

console.log('\nSetup completed.');
if (missingCredentials.length > 0) {
  console.log(`Add ${missingCredentials.map(([name]) => name).join(' and ')} to .env.`);
  console.log('Then run: pnpm env:check && pnpm dev');
} else {
  console.log('Run: pnpm doctor:services && pnpm dev');
}
