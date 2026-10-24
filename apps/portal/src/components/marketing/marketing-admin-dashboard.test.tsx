import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { AdminDashboardMock } from './marketing-admin-dashboard';
import { SESSION } from './preview/fixtures';
import { SCREENS } from './preview/screens';

import { visibleNavItems, type NavItem } from '@/lib/navigation';

// Vitest does not run Next's static-image loader, so an imported PNG has no
// width and `next/image` throws. The logo is decoration here; a plain `<img>`
// stands in for it.
vi.mock('next/image', () => ({
  default: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

// The real screens read the router; outside an app there is none to mount.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

beforeAll(() => {
  // jsdom has no ResizeObserver; the preview simply stays unscaled without one.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

afterEach(cleanup);

/**
 * The hero's preview of the admin portal. Its own behaviour is the sidebar —
 * the screens are the product's, tested where they live — so that is what is
 * tested: the Admin's menu is shown, a choice marks itself current and is
 * announced, and groups open to their pages.
 */
describe('AdminDashboardMock', () => {
  const sidebar = () => within(screen.getAllByRole('navigation', { name: 'Preview pages' })[0]!);

  it("shows the Admin's menu with the dashboard current", () => {
    render(<AdminDashboardMock />);

    for (const label of ['Dashboard', 'Add admission', 'Students', 'Staff', 'Salaries']) {
      expect(sidebar().getByRole('button', { name: label })).toBeTruthy();
    }
    expect(sidebar().getByRole('button', { name: 'Dashboard' }).getAttribute('aria-current')).toBe(
      'page',
    );
  });

  it('marks a chosen page as current and announces it', () => {
    render(<AdminDashboardMock />);

    fireEvent.click(sidebar().getByRole('button', { name: 'Students' }));

    expect(sidebar().getByRole('button', { name: 'Students' }).getAttribute('aria-current')).toBe(
      'page',
    );
    expect(
      sidebar().getByRole('button', { name: 'Dashboard' }).getAttribute('aria-current'),
    ).toBeNull();
    expect(screen.getByText('Showing Students')).toBeTruthy();
  });

  // Every destination in the menu has a screen, and every screen renders its
  // sample data without throwing — the fixtures are typed, but a real screen
  // can still trip over a value that is legal but unexpected.
  it.each(Object.keys(SCREENS))('renders the real %s screen from the fixtures', async (href) => {
    const Screen = SCREENS[href]!;
    const { container } = render(<Screen />);
    await waitFor(() => {
      expect(container.querySelector('.animate-pulse')).toBeNull();
    });
    expect(container.textContent?.length ?? 0).toBeGreaterThan(50);
  });

  it('has a screen for every page in the menu', () => {
    const leaves: string[] = [];
    const walk = (items: readonly NavItem[]): void => {
      for (const item of items) {
        if ((item.children ?? []).length > 0) {
          walk(item.children ?? []);
        } else {
          leaves.push(item.href);
        }
      }
    };
    walk(visibleNavItems(SESSION.permissions));
    expect(leaves.filter((href) => SCREENS[href] === undefined)).toEqual([]);
  });

  it('opens a group onto its first page', () => {
    render(<AdminDashboardMock />);

    fireEvent.click(sidebar().getByRole('button', { name: 'Fees' }));

    const vouchers = sidebar().getByRole('button', { name: 'Fee Vouchers' });
    expect(vouchers.getAttribute('aria-current')).toBe('page');
  });
});
