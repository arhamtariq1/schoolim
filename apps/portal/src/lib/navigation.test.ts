import type { Permission } from '@ilm/contracts';
import { describe, expect, it } from 'vitest';

import { NAV_ITEMS, visibleNavItems, type NavItem } from './navigation';

/**
 * The sidebar a set of permissions produces.
 *
 * The bug this guards against is named in `navigation.ts` itself: **a menu item
 * that leads to a 403**. It happens when the menu and the permission it needs
 * are declared in two places and one of them moves — so these tests assert the
 * shape of the menu for real roles rather than the contents of the array.
 *
 * The hidden-by-the-UI/decided-by-the-API split matters here too. Filtering is
 * a courtesy so nobody is shown a door they cannot open; every route behind it
 * is checked on the server regardless, and none of this is a security control.
 */

/** An accountant: everything in Fees, nothing else. */
const ACCOUNTANT: Permission[] = [
  'fees.voucher.read',
  'fees.voucher.generate',
  'fees.defaulter.read',
  'fees.plan.read',
  'fees.deposit.read',
];

function labels(items: readonly NavItem[]): string[] {
  return items.map((item) => item.label);
}

function find(items: readonly NavItem[], label: string): NavItem | undefined {
  return items.find((item) => item.label === label);
}

describe('the fees section', () => {
  it('lists its five screens for somebody who holds all of them', () => {
    const fees = find(visibleNavItems(ACCOUNTANT), 'Fees');

    expect(labels(fees?.children ?? [])).toEqual([
      'Fee vouchers',
      'Generate fee',
      'Defaulters',
      'Fee increment',
      'Security deposits',
    ]);
  });

  it('shows only the screens a permission actually opens', () => {
    // A receptionist who may look at vouchers and chase defaulters, but not
    // generate a run, change a fee, or see the deposits held.
    const visible = visibleNavItems(['fees.voucher.read', 'fees.defaulter.read']);
    const fees = find(visible, 'Fees');

    expect(labels(fees?.children ?? [])).toEqual(['Fee vouchers', 'Defaulters']);
  });

  it('disappears entirely rather than becoming a heading that expands to nothing', () => {
    // The parent's own permission is `fees.voucher.read`, so without it the
    // section goes even though other fee permissions are held. `/fees` only
    // redirects, so leaving it would be a dead item.
    const visible = visibleNavItems(['fees.deposit.read', 'students.student.read']);

    expect(labels(visible)).not.toContain('Fees');
  });

  it('is absent for somebody with no fee permissions at all', () => {
    const teacher = visibleNavItems(['attendance.record.read', 'students.student.read']);

    expect(labels(teacher)).not.toContain('Fees');
  });

  it('points at a container route, so the section expands rather than navigating', () => {
    const fees = find(visibleNavItems(ACCOUNTANT), 'Fees');

    // `/fees` redirects to the voucher list; the sidebar renders a section with
    // children as a disclosure button, and the mobile bar follows the first
    // child. Either way nobody lands on the redirect itself.
    expect(fees?.href).toBe('/fees');
    expect(fees?.children?.[0]?.href).toBe('/fees/vouchers');
  });
});

describe('the sidebar as a whole', () => {
  it('shows nothing at all to somebody holding no permissions', () => {
    expect(visibleNavItems([])).toEqual([]);
  });

  it('gives a teacher a short menu, not an owner’s', () => {
    const teacher = visibleNavItems([
      'dashboard.workspace.read',
      'students.student.read',
      'attendance.record.read',
    ]);

    expect(labels(teacher)).toEqual(['Home', 'Students', 'Attendance']);
  });

  it('never offers an item whose permission is not held', () => {
    const held = new Set(ACCOUNTANT);

    const walk = (items: readonly NavItem[]): void => {
      for (const item of items) {
        expect(held.has(item.permission)).toBe(true);
        walk(item.children ?? []);
      }
    };

    walk(visibleNavItems(ACCOUNTANT));
  });

  it('declares a permission and an icon on every item, at every depth', () => {
    const walk = (items: readonly NavItem[]): void => {
      for (const item of items) {
        expect(item.permission).not.toBe('');
        expect(item.icon).not.toBe('');
        expect(item.href.startsWith('/')).toBe(true);
        walk(item.children ?? []);
      }
    };

    walk(NAV_ITEMS);
  });

  it('has no duplicate destinations, which would light up two items at once', () => {
    const seen: string[] = [];
    const walk = (items: readonly NavItem[]): void => {
      for (const item of items) {
        seen.push(item.href);
        walk(item.children ?? []);
      }
    };
    walk(NAV_ITEMS);

    expect(seen).toEqual([...new Set(seen)]);
  });
});
