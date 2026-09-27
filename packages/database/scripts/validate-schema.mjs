import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const prismaCli = require.resolve('prisma/build/index.js');
const schemaPath = resolve(packageDirectory, 'prisma/schema.prisma');

execFileSync(process.execPath, [prismaCli, 'validate', '--schema', schemaPath], {
  cwd: packageDirectory,
  env: {
    ...process.env,
    CHECKPOINT_DISABLE: '1',
    PRISMA_HIDE_UPDATE_MESSAGE: '1',
    DATABASE_URL:
      process.env.DATABASE_URL ??
      'postgresql://schema_validation:schema_validation@127.0.0.1:5432/schema_validation',
  },
  stdio: 'inherit',
});
