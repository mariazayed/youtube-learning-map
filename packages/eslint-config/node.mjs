import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

const defaultIgnores = ['dist/**', 'node_modules/**', 'coverage/**'];

export function createNodeConfig({ tsconfigRootDir, rules = {}, ignores = [] }) {
  if (!tsconfigRootDir) {
    throw new TypeError('createNodeConfig requires tsconfigRootDir.');
  }

  return tseslint.config(
    eslint.configs.recommended,
    ...tseslint.configs.recommendedTypeChecked,
    {
      languageOptions: {
        parserOptions: {
          projectService: true,
          tsconfigRootDir,
        },
      },
      rules,
    },
    { ignores: [...defaultIgnores, ...ignores] },
  );
}
