import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SCHOOL_ROLES } from '@ilm/contracts';
import { describe, expect, it } from 'vitest';

import {
  PLATFORM_TABLES,
  SELF_SCOPED_TABLES,
  TENANT_MODELS,
  TENANT_RLS_EXEMPT_TABLES,
  isDeliberatelyUnscopedIndex,
} from './tenant-models';

/**
 * These tests read `schema.prisma` as text rather than the generated client, so
 * they run in CI without a database and without a prior `prisma generate`.
 */
const schemaPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'prisma', 'schema.prisma');
const schema = readFileSync(schemaPath, 'utf8');

function enumValues(name: string): string[] {
  const block = new RegExp(`enum ${name} \\{([\\s\\S]*?)\\n\\}`).exec(schema);
  if (block?.[1] === undefined) {
    throw new Error(`enum ${name} not found in schema.prisma`);
  }
  return block[1]
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('//') && !line.startsWith('@@'));
}

function modelBlock(name: string): string {
  const block = new RegExp(`\\nmodel ${name} \\{([\\s\\S]*?)\\n\\}`).exec(schema);
  if (block?.[1] === undefined) {
    throw new Error(`model ${name} not found in schema.prisma`);
  }
  return block[1];
}

function modelNames(): string[] {
  return [...schema.matchAll(/\nmodel (\w+) \{/g)].map(([, name]) => name ?? '');
}

describe('schema and contracts stay in step', () => {
  it('declares exactly the roles the permission matrix knows about', () => {
    // Drift here would mean the database accepts a role the matrix cannot
    // resolve any permission for, which fails silently at runtime.
    expect(enumValues('SchoolRole')).toEqual([...SCHOOL_ROLES]);
  });
});

describe('tenant model registry', () => {
  it('registers a model that actually exists', () => {
    const models = modelNames();
    for (const model of TENANT_MODELS) {
      expect(models).toContain(model);
    }
  });

  it('gives every registered tenant model a non-nullable school_id', () => {
    for (const model of TENANT_MODELS) {
      expect(modelBlock(model)).toMatch(/schoolId\s+String\s+@map\("school_id"\)/);
    }
  });

  it('indexes every tenant model with school_id leading', () => {
    for (const model of TENANT_MODELS) {
      const body = modelBlock(model);
      const indexes = [...body.matchAll(/@@(?:index|unique)\(\[([^\]]+)\]/g)].map(
        ([, fields]) => fields ?? '',
      );

      expect(indexes.length).toBeGreaterThan(0);
      for (const index of indexes) {
        const fields = index.trim();
        if (isDeliberatelyUnscopedIndex(model, fields)) {
          // A named, reasoned exception — see UNSCOPED_INDEXES. There is one
          // query in the product that crosses tenants on purpose, and this is
          // where it is declared rather than quietly tolerated.
          continue;
        }
        expect(
          fields.startsWith('schoolId'),
          `${model}: @@index([${fields}]) does not lead with schoolId`,
        ).toBe(true);
      }
    }
  });

  it('accounts for every model carrying a school_id', () => {
    // A new tenant table must be registered, or explicitly and reasonedly
    // exempted. Anything else is someone forgetting, and this is where it
    // surfaces rather than in a cross-tenant leak.
    const accountedFor = new Set<string>([
      ...TENANT_MODELS,
      // Table names rather than model names, mapped back below.
      ...PLATFORM_TABLES,
      ...SELF_SCOPED_TABLES,
      ...TENANT_RLS_EXEMPT_TABLES,
    ]);

    const unaccounted = modelNames().filter((model) => {
      const body = modelBlock(model);
      if (!/@map\("school_id"\)/.test(body)) {
        return false;
      }
      const tableName = /@@map\("(\w+)"\)/.exec(body)?.[1] ?? '';
      return !accountedFor.has(model) && !accountedFor.has(tableName);
    });

    expect(unaccounted).toEqual([]);
  });
});

describe('audit log', () => {
  it('is keyed so it can be partitioned by month', () => {
    // PostgreSQL requires the partition key in the primary key. Retrofitting
    // partitioning onto a live audit table is a migration nobody wants.
    expect(modelBlock('AuditLog')).toMatch(/@@id\(\[id, at\]\)/);
  });

  it('records the platform actor behind an impersonated action', () => {
    // "Who really did this" must always be answerable (docs/17 section 5).
    expect(modelBlock('AuditLog')).toMatch(/actor_platform_user_id/);
  });
});

describe('identity', () => {
  it('scopes email uniqueness to the school, not globally', () => {
    // The same person may hold an account at two schools with one address.
    expect(modelBlock('User')).toMatch(/@@unique\(\[schoolId, email\]\)/);
  });

  it('stores only a hash of a refresh token', () => {
    const body = modelBlock('Session');
    expect(body).toMatch(/refreshTokenHash/);
    expect(body).not.toMatch(/refreshToken\s+String/);
  });

  it('groups sessions into a family, so reuse can revoke the whole chain', () => {
    expect(modelBlock('Session')).toMatch(/familyId/);
  });
});

describe('platform separation', () => {
  it('keeps platform users in their own table with no school_id', () => {
    const body = modelBlock('PlatformUser');
    expect(body).not.toMatch(/school_id/);
    expect(body).toMatch(/mfaSecret/);
  });
});
