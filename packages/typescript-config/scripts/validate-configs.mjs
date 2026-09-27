import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const directory = resolve(import.meta.dirname, '..');
const names = ['base.json', 'library.json', 'nestjs.json', 'nextjs.json'];
const configs = await Promise.all(
  names.map(async (name) => JSON.parse(await readFile(resolve(directory, name), 'utf8'))),
);

if (configs[0]?.compilerOptions?.strict !== true) {
  throw new Error('The base TypeScript configuration must enable strict mode.');
}

console.log(`Validated ${configs.length} shared TypeScript configurations.`);
