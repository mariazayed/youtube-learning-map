import { createNextConfig } from '@learnmap/eslint-config/next';
import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

const config = [
  ...createNextConfig(),
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
];

export default config;
