import { base } from './base.mjs';
import { apiBoundaries } from './boundaries.mjs';

export const nest = [
  ...base,
  {
    settings: apiBoundaries.settings,
    rules: {
      ...apiBoundaries.rules,

      // Nest's DI style trips a few rules that are correct elsewhere.
      '@typescript-eslint/no-extraneous-class': 'off',

      // R2: tenant scope is never a function parameter. It comes from CLS.
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TSParameterProperty > Identifier[name=/^(schoolId|tenantId)$/]',
          message:
            'R2: tenant scope comes from CLS, never a parameter. See docs/04-multi-tenancy-and-security.md.',
        },
        {
          selector: 'FunctionDeclaration > Identifier[name=/^(schoolId|tenantId)$/]',
          message: 'R2: tenant scope comes from CLS, never a parameter.',
        },
        {
          selector: 'MethodDefinition Identifier[name=/^(schoolId|tenantId)$/].params',
          message: 'R2: tenant scope comes from CLS, never a parameter.',
        },
        {
          selector: 'NewExpression[callee.name="Date"][arguments.length=0]',
          message: 'Use the injected Clock so time is testable and the timezone is explicit.',
        },
      ],
    },
  },
  {
    // Nest requires default exports in a few conventional places.
    files: ['**/*.module.ts', '**/main.ts', '**/*.config.ts', '**/prisma/**'],
    rules: { 'import/no-default-export': 'off' },
  },
  {
    // The tenant plumbing is the one place allowed to name schoolId explicitly.
    files: ['**/shared/tenant/**', '**/infra/prisma/**', '**/*.spec.ts', '**/test/**'],
    rules: { 'no-restricted-syntax': 'off' },
  },
];

export default nest;
