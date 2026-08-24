/** @type {import("prettier").Config} */
export default {
  printWidth: 100,
  singleQuote: true,
  semi: true,
  trailingComma: 'all',
  arrowParens: 'always',
  endOfLine: 'lf',
  plugins: ['prettier-plugin-tailwindcss'],
  tailwindStylesheet: './packages/config/tailwind/theme.css',
  overrides: [{ files: '*.md', options: { proseWrap: 'always' } }],
};
