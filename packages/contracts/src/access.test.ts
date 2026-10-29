import { describe, expect, it } from 'vitest';

import {
  CUSTOMIZABLE_PERMISSIONS,
  isGrantedWith,
  LOCKED_PERMISSIONS,
  NO_OVERRIDES,
  resolveGrants,
  roleGrants,
  sameOverrides,
  updatePermissionOverridesSchema,
  withPermission,
} from './access';
import { PERMISSIONS } from './permissions';
import { permissionsFor } from './roles';

describe('access catalogue', () => {
  it('lists every customisable permission exactly once', () => {
    const locked = new Set<string>(LOCKED_PERMISSIONS);
    const expected = PERMISSIONS.filter((permission) => !locked.has(permission));

    expect([...CUSTOMIZABLE_PERMISSIONS].sort()).toEqual([...expected].sort());
    expect(new Set(CUSTOMIZABLE_PERMISSIONS).size).toBe(CUSTOMIZABLE_PERMISSIONS.length);
  });
});

describe('resolveGrants', () => {
  it('matches the role defaults when nothing is customised', () => {
    const roles = ['TEACHER', 'ACCOUNTANT'] as const;
    expect([...resolveGrants(roles, {}).keys()].sort()).toEqual(permissionsFor(roles).sort());
  });

  it('applies a role change to everyone holding the role', () => {
    const grants = resolveGrants(['TEACHER'], {
      TEACHER: { grant: ['fees.payment.create'], revoke: ['exams.mark.create'] },
    });

    expect(grants.get('fees.payment.create')).toBe('all');
    expect(grants.has('exams.mark.create')).toBe(false);
  });

  it('applies a person change after the role, in both directions', () => {
    const grants = resolveGrants(
      ['TEACHER'],
      { TEACHER: { grant: ['fees.payment.create'], revoke: [] } },
      { grant: ['staff.record.read'], revoke: ['fees.payment.create'] },
    );

    expect(grants.get('staff.record.read')).toBe('all');
    expect(grants.has('fees.payment.create')).toBe(false);
  });

  it('never upgrades a scoped grant to the whole school', () => {
    const grants = resolveGrants(['TEACHER'], {}, { grant: ['students.student.read'], revoke: [] });
    expect(grants.get('students.student.read')).toBe('scoped');
  });

  it('keeps another role’s grant when only one role is revoked', () => {
    const grants = resolveGrants(['TEACHER', 'ADMIN'], {
      TEACHER: { grant: [], revoke: ['students.student.read'] },
    });
    expect(grants.get('students.student.read')).toBe('all');
  });

  it('ignores changes stored for the owner, parents and students', () => {
    expect(
      resolveGrants(['OWNER'], {}, { grant: [], revoke: ['settings.user.manage'] }).has(
        'settings.user.manage',
      ),
    ).toBe(true);
    expect(
      resolveGrants(['PARENT'], { PARENT: { grant: ['students.student.read'], revoke: [] } }).has(
        'students.student.read',
      ),
    ).toBe(false);
  });

  it('never removes a locked permission', () => {
    const grants = resolveGrants(['TEACHER'], {}, { grant: [], revoke: ['dashboard.workspace.read'] });
    expect(grants.has('dashboard.workspace.read')).toBe(true);
  });
});

describe('withPermission', () => {
  const base = roleGrants('TEACHER');

  it('records a change only when it differs from the base', () => {
    const on = withPermission(base, NO_OVERRIDES, 'staff.record.read', true);
    expect(on).toEqual({ grant: ['staff.record.read'], revoke: [] });
    expect(isGrantedWith(base, on, 'staff.record.read')).toBe(true);

    expect(withPermission(base, on, 'staff.record.read', false)).toEqual(NO_OVERRIDES);
  });

  it('records taking away what the base gives', () => {
    const off = withPermission(base, NO_OVERRIDES, 'exams.mark.create', false);
    expect(off).toEqual({ grant: [], revoke: ['exams.mark.create'] });
    expect(isGrantedWith(base, off, 'exams.mark.create')).toBe(false);
    expect(sameOverrides(withPermission(base, off, 'exams.mark.create', true), NO_OVERRIDES)).toBe(true);
  });
});

describe('updatePermissionOverridesSchema', () => {
  it('refuses a permission both given and taken away', () => {
    expect(
      updatePermissionOverridesSchema.safeParse({
        grant: ['staff.record.read'],
        revoke: ['staff.record.read'],
      }).success,
    ).toBe(false);
  });

  it('refuses unknown and locked permissions', () => {
    expect(updatePermissionOverridesSchema.safeParse({ grant: ['made.up.thing'], revoke: [] }).success).toBe(
      false,
    );
    expect(
      updatePermissionOverridesSchema.safeParse({ grant: ['settings.billing.manage'], revoke: [] }).success,
    ).toBe(false);
  });
});
