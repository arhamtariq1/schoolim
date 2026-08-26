import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { config } from 'dotenv';

/**
 * Load `.env` from the **workspace root**, wherever the process was started.
 *
 * `import 'dotenv/config'` reads `.env` from the current working directory,
 * which in a monorepo is whichever package is running. That quietly grew three
 * copies of the same credentials — root, `apps/api`, `packages/db` — and the
 * moment one changed, the API kept dialling the old database while every
 * command-line tool used the new one. The symptom was a `DatabaseNotReachable`
 * naming a host that no longer appeared in any file being edited.
 *
 * One file, found by walking up to the workspace marker. A package-local `.env`
 * still wins if one exists, so a genuinely per-package override stays possible
 * — it is just no longer the accidental default.
 *
 * This lives in `@ilm/db` because it is the database connection that made the
 * duplication dangerous, and because every process that needs the file already
 * depends on this package.
 */
export function loadEnv(startDir: string = process.cwd()): void {
  // Package-local first: dotenv does not overwrite an already-set variable, so
  // whichever is loaded first wins.
  const local = join(startDir, '.env');
  if (existsSync(local)) {
    config({ path: local, quiet: true });
  }

  const root = findWorkspaceRoot(startDir);
  if (root !== undefined && root !== startDir) {
    config({ path: join(root, '.env'), quiet: true });
  }
}

/** The directory holding `pnpm-workspace.yaml`, searching upwards. */
function findWorkspaceRoot(startDir: string): string | undefined {
  let current = resolve(startDir);

  for (;;) {
    if (existsSync(join(current, 'pnpm-workspace.yaml'))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}
