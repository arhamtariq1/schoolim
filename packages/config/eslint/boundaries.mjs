/**
 * R9: module boundaries follow the layer order in docs/03-architecture.md §3.
 *
 *   controller -> service -> repository -> infra (prisma)
 *
 * A controller may never import a repository. A repository may never import a
 * service. Enforced, not suggested — a rule that depends on discipline decays
 * in month four.
 *
 * **Why not `eslint-plugin-boundaries`?** Its `dependencies` rule governs
 * imports *between elements* (folders). Our layers are filename suffixes inside
 * a single module folder — `fees/voucher.controller.ts` importing
 * `fees/voucher.repository.ts` is an intra-element import, which that rule
 * ignores by design. Verified by writing the violation and watching it pass.
 *
 * `no-restricted-imports` with per-file overrides does fire, and is negative-
 * tested in the API's own lint suite. The plugin is still used for the
 * cross-package graph in `base.mjs`.
 */

const LAYER_MESSAGE_SUFFIX = 'See docs/03-architecture.md §3 and docs/12 R9.';

/**
 * Flat-config override blocks. Spread these into an app's eslint config after
 * the shared base.
 */
export const apiBoundaries = [
  {
    files: ['src/**/*.controller.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/*.repository', '**/*.repository.ts'],
              message: `R9: a controller may not import a repository — go through the service. ${LAYER_MESSAGE_SUFFIX}`,
            },
            {
              // The database layer moved from `@ilm/db` into this app, so the
              // rule follows it by path rather than by package name. It bans the
              // raw client and the tenancy helpers, exactly as the package ban
              // did — not the injected `PrismaService`, which is how the health
              // controller runs its liveness probe.
              // Gitignore semantics, so this covers the folder and everything
              // in it — the barrel, the generated client, the tenancy helpers
              // and the injected service alike. The liveness probe is the one
              // documented exception; see apps/api/eslint.config.mjs.
              group: ['**/prisma'],
              message: `R9: a controller may not touch the database directly. ${LAYER_MESSAGE_SUFFIX}`,
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/**/*.repository.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/*.service', '**/*.service.ts', '**/*.controller', '**/*.controller.ts'],
              message: `R9: a repository is the bottom layer and may not import a service or controller. ${LAYER_MESSAGE_SUFFIX}`,
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/**/*.service.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/*.controller', '**/*.controller.ts'],
              message: `R9: a service may not import a controller. ${LAYER_MESSAGE_SUFFIX}`,
            },
          ],
        },
      ],
    },
  },
];

export default apiBoundaries;
