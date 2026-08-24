import { base } from '@ilm/config/eslint/base';
import { apiBoundaries } from '@ilm/config/eslint/boundaries';

export default [
  ...base,
  // R9 layer enforcement. Negative-tested: see the probe in the commit history.
  ...apiBoundaries,
  {
    files: ['src/**/*.ts'],
    rules: {
      // NestJS modules are legitimately class-only.
      '@typescript-eslint/no-extraneous-class': 'off',
    },
  },
];
