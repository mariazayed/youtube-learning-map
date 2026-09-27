import { createNodeConfig } from '@learnmap/eslint-config/node';

export default createNodeConfig({
  tsconfigRootDir: import.meta.dirname,
  rules: {
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-misused-promises': 'off',
  },
});
