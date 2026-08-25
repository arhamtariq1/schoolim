import 'dotenv/config';

import { systemClock } from '@ilm/utils';
import { hash } from '@node-rs/argon2';

import { createAdminClient } from './client';

/**
 * Seed a demo school so the portal is usable immediately after a fresh
 * migration.
 *
 * This is **development seed data, not a fixture** — it exists so that
 * `pnpm db:seed` gives you a school you can sign into, rather than a login page
 * that rejects every credential because the database is empty.
 *
 * Idempotent: re-running updates the same rows rather than failing on a
 * duplicate or creating a second school.
 *
 * Runs on the admin connection because there is no tenant context yet — the
 * school being created is the thing that would provide it.
 */

const SCHOOL_ID = '00000000-0000-4000-8000-000000000001';
const OWNER_ID = '00000000-0000-4000-8000-000000000002';

const SLUG = 'demo';
const OWNER_EMAIL = 'owner@demo.test';

/**
 * A deliberately obvious development password. It is printed to the console on
 * seed, is only ever used against a local database, and is not a secret — which
 * is exactly why it must never appear in a deployed environment.
 */
const OWNER_PASSWORD = 'demo-password-1234';

async function main(): Promise<void> {
  if (process.env['NODE_ENV'] === 'production') {
    throw new Error('Refusing to seed demo data into a production environment.');
  }

  const db = createAdminClient({ url: process.env['DATABASE_ADMIN_URL'] ?? '' });

  const school = await db.school.upsert({
    where: { id: SCHOOL_ID },
    update: { name: 'Demo Public School', slug: SLUG },
    create: {
      id: SCHOOL_ID,
      name: 'Demo Public School',
      slug: SLUG,
      legalName: 'Demo Public School (Pvt) Ltd',
      city: 'Lahore',
      status: 'ACTIVE',
      onboardedAt: systemClock.now(),
    },
  });

  const passwordHash = await hash(OWNER_PASSWORD, {
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });

  const owner = await db.user.upsert({
    where: { id: OWNER_ID },
    update: { passwordHash, status: 'ACTIVE' },
    create: {
      id: OWNER_ID,
      schoolId: school.id,
      email: OWNER_EMAIL,
      name: 'Demo Owner',
      passwordHash,
      status: 'ACTIVE',
    },
  });

  await db.userRole.upsert({
    where: { schoolId_userId_role: { schoolId: school.id, userId: owner.id, role: 'OWNER' } },
    update: {},
    create: { schoolId: school.id, userId: owner.id, role: 'OWNER' },
  });

  await db.$disconnect();

  const portalPort = process.env['PORTAL_PORT'] ?? '3000';

  console.warn(`
Seeded.

  Portal    http://${SLUG}.localhost:${portalPort}/login
  Email     ${OWNER_EMAIL}
  Password  ${OWNER_PASSWORD}

The school comes from the subdomain, so sign in at ${SLUG}.localhost — not at
localhost. A login page that made you pick a school would leak the tenant list.
`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
