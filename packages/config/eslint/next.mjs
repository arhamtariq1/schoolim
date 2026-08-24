import { base } from './base.mjs';

/**
 * The parts of docs/16-ui-principles.md a linter can actually catch.
 * The rest is the section 14 checklist and code review.
 */
export const next = [
  ...base,
  {
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@heroicons/react',
              message:
                'Icons: lucide-react only, imported through @ilm/ui/icons. See docs/16-ui-principles.md section 3.',
            },
            {
              name: 'react-icons',
              message: 'Icons: lucide-react only, imported through @ilm/ui/icons.',
            },
            {
              name: '@tabler/icons-react',
              message: 'Icons: lucide-react only, imported through @ilm/ui/icons.',
            },
            {
              name: '@mui/material',
              message: 'Components: shadcn/ui on Radix, in @ilm/ui. No second component library.',
            },
            {
              name: 'antd',
              message: 'Components: shadcn/ui on Radix, in @ilm/ui. No second component library.',
            },
            {
              name: 'styled-components',
              message: 'No runtime CSS-in-JS. Tailwind v4 tokens only.',
            },
            {
              name: '@emotion/react',
              message: 'No runtime CSS-in-JS. Tailwind v4 tokens only.',
            },
            {
              name: '@ilm/db',
              message:
                'A Next.js app may never import Prisma - tenant enforcement would be bypassable. See docs/06-repo-structure.md section 2.',
            },
          ],
          patterns: [
            {
              group: ['lucide-react'],
              message:
                'Import icons from @ilm/ui/icons, not lucide-react directly, so one meaning maps to one icon product-wide.',
            },
          ],
        },
      ],
    },
  },
  {
    // @ilm/ui is the one place that may reach lucide-react directly.
    files: ['**/packages/ui/**'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    // Next.js requires default exports in these conventional files.
    files: [
      '**/app/**/page.tsx',
      '**/app/**/layout.tsx',
      '**/app/**/error.tsx',
      '**/app/**/loading.tsx',
      '**/app/**/not-found.tsx',
      '**/app/**/template.tsx',
      '**/app/**/default.tsx',
      '**/app/**/route.ts',
      '**/next.config.*',
      '**/middleware.ts',
    ],
    rules: { 'import/no-default-export': 'off' },
  },
];

export default next;
