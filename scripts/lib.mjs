import { existsSync, readFileSync } from 'node:fs';
import net from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { spawnSync } from 'node:child_process';

export const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const envPath = resolve(rootDirectory, '.env');

export function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: rootDirectory,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    ...options,
  });
}

export function commandVersion(command, args = ['--version']) {
  const result = run(command, args);
  return result.status === 0 ? result.stdout.trim() || result.stderr.trim() : null;
}

export function loadEnvironment() {
  if (!existsSync(envPath)) return null;
  return parseEnv(readFileSync(envPath, 'utf8'));
}

export function isConfiguredSecret(value) {
  if (!value || value.trim().length < 10) return false;
  return !/^(change|replace|your[-_ ]|example|todo)/i.test(value.trim());
}

export function checkTcp(host, port, timeoutMs = 2_000) {
  return new Promise((resolveCheck) => {
    const socket = net.createConnection({ host, port });
    const finish = (available) => {
      socket.destroy();
      resolveCheck(available);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

export async function waitForTcp(host, port, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await checkTcp(host, port, 1_000)) return true;
    await new Promise((resolveWait) => setTimeout(resolveWait, 1_000));
  }
  return false;
}

export function endpointFromUrl(value, defaultPort) {
  const url = new URL(value);
  return { host: url.hostname, port: Number(url.port || defaultPort) };
}

export function mark(ok) {
  return ok ? '✓' : '✗';
}
