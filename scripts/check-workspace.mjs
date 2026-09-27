import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { rootDirectory } from './lib.mjs';

const projects = [
  'apps/web',
  'apps/api',
  'apps/worker',
  'packages/config',
  'packages/contracts',
  'packages/database',
  'packages/eslint-config',
  'packages/evaluation',
  'packages/observability',
  'packages/typescript-config',
];

const names = new Set();
const errors = [];

for (const project of projects) {
  const manifestPath = resolve(rootDirectory, project, 'package.json');
  if (!existsSync(manifestPath)) {
    errors.push(`${project}: package.json is missing`);
    continue;
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (typeof manifest.name !== 'string' || !manifest.name.startsWith('@learnmap/')) {
    errors.push(`${project}: package name must use the @learnmap scope`);
  } else if (names.has(manifest.name)) {
    errors.push(`${project}: duplicate package name ${manifest.name}`);
  } else {
    names.add(manifest.name);
  }

  for (const section of ['dependencies', 'devDependencies']) {
    for (const [dependency, version] of Object.entries(manifest[section] ?? {})) {
      if (dependency.startsWith('@learnmap/') && version !== 'workspace:*') {
        errors.push(`${project}: ${dependency} must use workspace:*`);
      }
    }
  }
}

const requiredFiles = [
  'pnpm-workspace.yaml',
  'turbo.json',
  'infra/docker-compose.yml',
  '.env.example',
  '.gitignore',
  'packages/typescript-config/base.json',
  'packages/eslint-config/node.mjs',
];
for (const file of requiredFiles) {
  if (!existsSync(resolve(rootDirectory, file)))
    errors.push(`${file}: required file is missing`);
}

if (errors.length > 0) {
  console.error(`Workspace validation failed:\n- ${errors.join('\n- ')}`);
  process.exitCode = 1;
} else {
  console.log(
    `Workspace is valid: ${projects.length} projects, ${names.size} unique names.`,
  );
}
