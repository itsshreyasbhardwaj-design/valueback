import next from 'eslint-config-next';
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypeScript from 'eslint-config-next/typescript';

const eslintConfig = [
  { ignores: ['.next/**', 'node_modules/**', 'coverage/**', 'playwright-report/**', 'test-results/**', 'drizzle/**', 'storage/**', 'data/**'] },
  ...[next, nextCoreWebVitals, nextTypeScript].flat(),
  {
    rules: {
      // Server actions and drizzle calls are frequently fire-and-forget.
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': ['warn', { allow: ['warn', 'error', 'log'] }],
      'eqeqeq': ['error', 'smart'],
      // Leading underscore marks a parameter that exists only to satisfy a
      // signature, such as the unused prevState of a server action.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
];

export default eslintConfig;
