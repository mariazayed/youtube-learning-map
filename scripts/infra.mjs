import process from 'node:process';
import { commandVersion, run } from './lib.mjs';

const action = process.argv[2];
const compose = ['compose', '--env-file', '.env', '-f', 'infra/docker-compose.yml'];
const actions = {
  config: [...compose, 'config', '--quiet'],
  up: [...compose, 'up', '-d', '--wait'],
  status: [...compose, 'ps'],
  logs: [...compose, 'logs', '--tail', '100'],
  down: [...compose, 'down'],
};

let args = actions[action];
if (action === 'reset') {
  if (!process.argv.includes('--confirm-data-loss')) {
    console.error(
      'Reset deletes local PostgreSQL and Valkey data. Rerun with --confirm-data-loss.',
    );
    process.exit(1);
  }
  args = [...compose, 'down', '--volumes', '--remove-orphans'];
}

if (!args) {
  console.error('Usage: node scripts/infra.mjs <config|up|status|logs|down|reset>');
  process.exit(1);
}

if (!commandVersion('docker') || !commandVersion('docker', ['compose', 'version'])) {
  console.error(
    'Docker with the Compose plugin is required and must be running. On WSL, start Docker Desktop and enable integration for the Ubuntu distro.',
  );
  process.exit(1);
}

const result = run('docker', args, { stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status ?? 1);
