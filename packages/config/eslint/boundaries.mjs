/**
 * R9: module boundaries follow the layer order in docs/03-architecture.md section 3.
 *
 *   controller -> service -> repository -> infra (prisma)
 *
 * A controller may never import a repository. A repository may never import a
 * service. Enforced, not suggested.
 */
export const apiBoundaries = {
  settings: {
    'boundaries/elements': [
      { type: 'controller', pattern: 'src/modules/*/*.controller.ts', mode: 'file' },
      { type: 'service', pattern: 'src/modules/*/*.service.ts', mode: 'file' },
      { type: 'repository', pattern: 'src/modules/*/*.repository.ts', mode: 'file' },
      { type: 'shared', pattern: 'src/shared/**', mode: 'folder' },
      { type: 'infra', pattern: 'src/infra/**', mode: 'folder' },
    ],
    'boundaries/include': ['src/**/*.ts'],
  },
  rules: {
    'boundaries/element-types': [
      'error',
      {
        default: 'disallow',
        rules: [
          { from: 'controller', allow: ['service', 'shared'] },
          { from: 'service', allow: ['service', 'repository', 'shared'] },
          { from: 'repository', allow: ['infra', 'shared'] },
          { from: 'shared', allow: ['shared'] },
          { from: 'infra', allow: ['infra', 'shared'] },
        ],
      },
    ],
  },
};

export default apiBoundaries;
