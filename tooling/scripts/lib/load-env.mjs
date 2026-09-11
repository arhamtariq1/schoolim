/**
 * Load the apps' own `.env` files, from a script running at the repo root.
 *
 * The environment moved from one file at the root into one per app, so
 * `import 'dotenv/config'` — which reads `.env` from the current working
 * directory — now finds nothing when a verification script runs from the root.
 * The symptom is not an error: `DATABASE_ADMIN_URL` is simply undefined, and a
 * check that reads the database reports itself as "not configured" and passes.
 * Silence is the worst failure mode a verification script has.
 *
 * These scripts drive the running apps, so they load exactly what those apps
 * load: the API's file for the database and ports, the portal's for its own.
 * `dotenv` never overwrites a variable that is already set, so anything passed
 * on the command line still wins — which is what lets
 * `API_PORT=4100 node tooling/scripts/verify-flows.mjs` point at a test pair.
 */
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { config } from 'dotenv';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** Loaded in order; the first file to define a variable wins. */
const FILES = [
  join(repoRoot, 'apps', 'api', '.env'),
  join(repoRoot, 'apps', 'portal', '.env'),
  // A root file is no longer created, but one left over from before should not
  // be silently ignored — that would be its own confusing afternoon.
  join(repoRoot, '.env'),
];

for (const path of FILES) {
  if (existsSync(path)) {
    config({ path, quiet: true });
  }
}
