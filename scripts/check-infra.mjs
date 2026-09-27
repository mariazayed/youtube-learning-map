import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { parse } from 'yaml';
import { rootDirectory } from './lib.mjs';

const composePath = resolve(rootDirectory, 'infra/docker-compose.yml');
const compose = parse(readFileSync(composePath, 'utf8'));
const errors = [];

for (const serviceName of ['postgres', 'redis']) {
  const service = compose.services?.[serviceName];
  if (!service) {
    errors.push(`Missing ${serviceName} service.`);
    continue;
  }
  if (!service.healthcheck?.test) errors.push(`${serviceName} needs a health check.`);
  if (!Array.isArray(service.volumes) || service.volumes.length === 0) {
    errors.push(`${serviceName} needs persistent storage.`);
  }
  const ports = service.ports ?? [];
  if (!ports.every((port) => String(port).startsWith('127.0.0.1:'))) {
    errors.push(`${serviceName} ports must be bound to localhost.`);
  }
}

if (!String(compose.services?.postgres?.image).startsWith('postgres:17')) {
  errors.push('PostgreSQL must use major version 17.');
}
if (!String(compose.services?.redis?.image).startsWith('valkey/valkey:8')) {
  errors.push('The queue service must use Valkey major version 8.');
}
for (const volume of ['postgres_data', 'redis_data']) {
  if (!compose.volumes?.[volume]) errors.push(`Missing ${volume} volume.`);
}

for (const serviceName of ['prometheus', 'alertmanager', 'blackbox-exporter']) {
  const service = compose.services?.[serviceName];
  if (!service) {
    errors.push(`Missing ${serviceName} observability service.`);
    continue;
  }
  if (!service.profiles?.includes('observability')) {
    errors.push(`${serviceName} must use the observability profile.`);
  }
}

const prometheus = parse(
  readFileSync(resolve(rootDirectory, 'infra/observability/prometheus.yml'), 'utf8'),
);
const alertRules = parse(
  readFileSync(resolve(rootDirectory, 'infra/observability/alerts.yml'), 'utf8'),
);
if (!prometheus.alerting?.alertmanagers?.length) {
  errors.push('Prometheus must forward alerts to Alertmanager.');
}
if (!prometheus.rule_files?.includes('/etc/prometheus/rules/*.yml')) {
  errors.push('Prometheus must load the checked-in alert rules.');
}
const configuredAlerts = (alertRules.groups ?? []).flatMap((group) => group.rules ?? []);
for (const alertName of [
  'LearnMapWorkerDown',
  'LearnMapQueueBacklog',
  'LearnMapQueueGrowing',
]) {
  if (!configuredAlerts.some((rule) => rule.alert === alertName)) {
    errors.push(`Missing ${alertName} alert rule.`);
  }
}

const environment = parseEnv(
  readFileSync(resolve(rootDirectory, '.env.example'), 'utf8'),
);
for (const name of [
  'NODE_ENV',
  'WEB_URL',
  'API_URL',
  'NEXT_PUBLIC_API_URL',
  'DATABASE_URL',
  'REDIS_URL',
  'GEMINI_API_KEY',
  'GEMINI_VIDEO_MODEL',
  'YOUTUBE_API_KEY',
  'JWT_ISSUER',
  'JWT_AUDIENCE',
  'METRICS_TOKEN',
  'WORKER_METRICS_PORT',
  'WORKER_HEARTBEAT_TTL_SECONDS',
  'SENTRY_DSN',
]) {
  if (!(name in environment)) errors.push(`.env.example is missing ${name}.`);
}

if (errors.length > 0) {
  console.error(`Infrastructure validation failed:\n- ${errors.join('\n- ')}`);
  process.exitCode = 1;
} else {
  console.log(
    'Infrastructure definition is valid: data services and observability profile are configured.',
  );
}
