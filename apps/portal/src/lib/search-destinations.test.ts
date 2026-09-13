import { describe, expect, it } from 'vitest';

import { type NavItem } from './navigation';
import { flatten, searchDestinations } from './search-destinations';

/**
 * What ⌘K offers, and what it must never offer.
 *
 * The palette's whole value is that three letters beat remembering which
 * section a screen was filed under — which only holds if every screen is in
 * here, none of them twice, and none of them is a heading that opens nothing.
 *
 * It also has to inherit the sidebar's permission filtering exactly. A palette
 * that lists a page the API will refuse is the "menu item leads to a 403" bug
 * with a keyboard shortcut attached.
 */

const ACCOUNTANT = [
  'dashboard.workspace.read',
  'students.student.read',
  'fees.voucher.read',
  'fees.voucher.generate',
  'fees.defaulter.read',
  'fees.plan.read',
  'fees.deposit.read',
];

describe('what the palette offers', () => {
  it('offers leaves, never a section heading that only redirects', () => {
    const hrefs = searchDestinations(ACCOUNTANT).map((entry) => entry.href);

    // `/fees` redirects to the voucher list and expands a menu in the sidebar.
    // As a search result it would be a row that opens nothing in particular.
    expect(hrefs).not.toContain('/fees');
    expect(hrefs).toContain('/fees/vouchers');
    expect(hrefs).toContain('/fees/defaulters');
  });

  it('keeps a top-level page that has no children', () => {
    const hrefs = searchDestinations(ACCOUNTANT).map((entry) => entry.href);

    expect(hrefs).toContain('/students');
    expect(hrefs).toContain('/');
  });

  it('names the section a page came from, so two similar names are tellable apart', () => {
    const defaulters = searchDestinations(ACCOUNTANT).find(
      (entry) => entry.href === '/fees/defaulters',
    );

    expect(defaulters?.label).toBe('Defaulters');
    expect(defaulters?.section).toBe('Fees');
  });

  it('leaves the section undefined at the top level', () => {
    const students = searchDestinations(ACCOUNTANT).find((entry) => entry.href === '/students');

    expect(students?.section).toBeUndefined();
  });

  it('lists nothing twice', () => {
    const hrefs = searchDestinations(ACCOUNTANT).map((entry) => entry.href);

    expect(hrefs).toEqual([...new Set(hrefs)]);
  });
});

describe('it can only offer what the person may open', () => {
  it('hides a page whose permission is not held', () => {
    // May look at vouchers, may not generate them.
    const hrefs = searchDestinations([
      'dashboard.workspace.read',
      'fees.voucher.read',
      'fees.defaulter.read',
    ]).map((entry) => entry.href);

    expect(hrefs).toContain('/fees/vouchers');
    expect(hrefs).not.toContain('/fees/generate');
    expect(hrefs).not.toContain('/fees/security-deposits');
  });

  it('offers a teacher their own screens and nothing from Fees', () => {
    const hrefs = searchDestinations([
      'dashboard.workspace.read',
      'students.student.read',
      'attendance.record.read',
    ]).map((entry) => entry.href);

    expect(hrefs).toContain('/attendance/mark/students');
    expect(hrefs.some((href) => href.startsWith('/fees'))).toBe(false);
  });

  it('offers nothing at all to somebody holding no permissions', () => {
    expect(searchDestinations([])).toEqual([]);
  });
});

describe('matching', () => {
  const haystackFor = (href: string): string =>
    searchDestinations(ACCOUNTANT).find((entry) => entry.href === href)?.haystack ?? '';

  it('matches on the page name', () => {
    expect(haystackFor('/fees/defaulters')).toContain('defaulters');
  });

  it('matches on the section, so "fees def" finds it', () => {
    const haystack = haystackFor('/fees/defaulters');

    expect(haystack).toContain('fees');
    expect(haystack).toContain('defaulters');
  });

  it('matches on the path, so somebody who knows the URL can type it', () => {
    expect(haystackFor('/fees/security-deposits')).toContain('/fees/security-deposits');
  });

  it('is lower-cased, so the search does not have to be', () => {
    const haystack = haystackFor('/students');

    expect(haystack).toBe(haystack.toLowerCase());
  });
});

describe('a page added to the sidebar is searchable without anybody remembering', () => {
  it('walks whatever tree it is given, to any depth', () => {
    // Attendance nests three deep. A flattener that only handled two levels
    // would silently drop the marking screens, which are the most-used pages
    // in the product.
    const nested: NavItem[] = [
      {
        href: '/a',
        label: 'A',
        icon: 'DashboardIcon',
        permission: 'dashboard.workspace.read',
        children: [
          {
            href: '/a/b',
            label: 'B',
            icon: 'DashboardIcon',
            permission: 'dashboard.workspace.read',
            children: [
              {
                href: '/a/b/c',
                label: 'C',
                icon: 'DashboardIcon',
                permission: 'dashboard.workspace.read',
              },
            ],
          },
        ],
      },
    ];

    const flat = flatten(nested);

    expect(flat.map((entry) => entry.href)).toEqual(['/a/b/c']);
    // The nearest section wins, which is the one a person would name.
    expect(flat[0]?.section).toBe('B');
  });

  it('covers every attendance screen from the real tree', () => {
    const hrefs = searchDestinations([
      'dashboard.workspace.read',
      'attendance.record.read',
      'attendance.report.read',
    ]).map((entry) => entry.href);

    expect(hrefs).toContain('/attendance/mark/students');
    expect(hrefs).toContain('/attendance/mark/teachers');
    expect(hrefs).toContain('/attendance/reports/students');
    expect(hrefs).toContain('/attendance/reports/teachers');
  });
});
