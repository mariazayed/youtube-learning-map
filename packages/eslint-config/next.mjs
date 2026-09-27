export function createNextConfig({ ignores = [] } = {}) {
  return [
    {
      ignores: [
        '.next/**',
        'node_modules/**',
        'coverage/**',
        'next-env.d.ts',
        ...ignores,
      ],
    },
  ];
}
