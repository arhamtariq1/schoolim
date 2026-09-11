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
  {
    /**
     * The liveness probe is the one controller allowed to reach the database.
     *
     * R9 exists to stop controllers doing data access — reading rows, writing
     * them, shaping queries. `/health` does none of that: it asks whether the
     * connection is alive, as the application role, precisely so a green health
     * check cannot be reported by a process that has lost the database. Routing
     * that through a service would add a layer whose only method is `ping`.
     *
     * It was never caught before only because the rule named the `@ilm/db`
     * package, and this file imports `PrismaService` instead. Now that the rule
     * follows the path, the exception is written down rather than accidental.
     */
    files: ['src/modules/health/*.controller.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
];
