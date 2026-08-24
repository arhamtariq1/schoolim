import { next } from '@ilm/config/eslint/next';

export default [
  ...next,
  {
    // `src/icons.ts` is the single point where lucide-react is re-exported
    // under product names, so one meaning maps to one icon everywhere
    // (docs/16 §3). It is therefore the one file allowed to import it.
    //
    // This override lives here, not in the shared preset: ESLint flat-config
    // `files` patterns resolve relative to the config file's own directory, so
    // a `**/packages/ui/**` pattern written in packages/config never matches
    // anything when the config is loaded from packages/ui.
    files: ['src/icons.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
];
