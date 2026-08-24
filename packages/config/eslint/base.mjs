import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import boundaries from 'eslint-plugin-boundaries';
import importPlugin from 'eslint-plugin-import';
import tseslint from 'typescript-eslint';

/**
 * Shared flat config. Encodes the non-negotiables from docs/12-engineering-rules.md
 * that a linter can actually enforce.
 */
export const base = tseslint.config(
  {
    ignores: [
      'dist/**',
      '.next/**',
      '.turbo/**',
      'coverage/**',
      'node_modules/**',
      '**/*.config.*',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true },
    },
    plugins: { import: importPlugin, boundaries },
    rules: {
      // --- R10: no any, no ts-ignore without an issue link and an expiry -----
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-ignore': true,
          'ts-expect-error': {
            descriptionFormat: '^ TODO\\(#\\d+\\) expires \\d{4}-\\d{2}-\\d{2}: .+$',
          },
        },
      ],
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],

      // --- R1: no school-specific code --------------------------------------
      'no-restricted-syntax': [
        'error',
        {
          // Excludes comparison against an empty string: that is a validity
          // check on the value, not a branch on which school it is.
          selector:
            'BinaryExpression[operator=/^(===|!==|==|!=)$/][left.name=/^(schoolId|tenantId)$/][right.type="Literal"][right.value!=""]',
          message:
            'R1: no school-specific branching. A school-specific requirement is configuration, a feature flag, or it is not built. See CLAUDE.md.',
        },
        {
          selector:
            'BinaryExpression[operator=/^(===|!==|==|!=)$/][left.property.name=/^(schoolId|tenantId)$/][right.type="Literal"]',
          message: 'R1: no school-specific branching. See CLAUDE.md.',
        },
        {
          selector: 'NewExpression[callee.name="Date"][arguments.length=0]',
          message: 'Use the injected Clock so time is testable and the timezone is explicit.',
        },
      ],

      // --- R3: money. Bare Math.round on money is how paisa go missing ------
      // Full enforcement lives in the branded types in @ilm/utils/money.
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'round',
          message: 'Use the rounding helpers in @ilm/utils/money. See ADR-0007.',
        },
      ],

      'import/no-default-export': 'error',
      'import/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      eqeqeq: ['error', 'always'],
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  prettier,
);

export default base;
