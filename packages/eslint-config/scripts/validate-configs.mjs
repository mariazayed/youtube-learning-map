import { createNodeConfig } from '../node.mjs';
import { createNextConfig } from '../next.mjs';

const root = import.meta.dirname;
const nodeConfig = createNodeConfig({ tsconfigRootDir: root });
const nextConfig = createNextConfig();

if (!Array.isArray(nodeConfig) || nodeConfig.length === 0) {
  throw new Error('The shared Node.js ESLint configuration is empty.');
}
if (!Array.isArray(nextConfig) || nextConfig.length === 0) {
  throw new Error('The shared Next.js ESLint configuration is empty.');
}

console.log('Shared ESLint configurations are valid.');
