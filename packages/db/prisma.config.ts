import { defineConfig, env } from 'prisma/config';

import { loadEnv } from './src/load-env';

// After the imports, not before: imports are hoisted, so a call placed above
// them would still run second.
loadEnv();

/**
 * Prisma 7 moved connection URLs out of `schema.prisma` and into this file.
 *
 * **Migrations connect as the OWNER role, not the application role.** The
 * application role is deliberately `NOBYPASSRLS` and holds no DDL grant
 * (docs/04 section 2), so it could not create a table or a policy even if it
 * tried — which is the point. `DATABASE_ADMIN_URL` is the owner; `DATABASE_URL`
 * is the RLS-enforcing role every request uses at runtime.
 *
 * Prisma 7 no longer loads `.env` automatically, hence the explicit import
 * above. The process still refuses to start on a missing variable.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_ADMIN_URL'),
  },
});
