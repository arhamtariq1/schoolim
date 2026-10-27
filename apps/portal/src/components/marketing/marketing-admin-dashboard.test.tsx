import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { AdminDashboardMock } from './marketing-admin-dashboard';
import { SCREENS } from './preview/screens';

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
 * The hero's preview of the admin portal. It is a picture of the product, not
 * a second app: the dashboard renders from the fixtures, and nothing in the
 * frame can be focused or clicked.
 */
describe('AdminDashboardMock', () => {
  it('is one labelled image that nothing inside can be reached through', () => {
    const { container } = render(<AdminDashboardMock />);

    expect(screen.getByRole('img', { name: /admin dashboard, with sample data/i })).toBeTruthy();
    const stage = container.querySelector('.marketing-app-stage');
    expect(stage?.hasAttribute('inert')).toBe(true);
    expect(stage?.getAttribute('aria-hidden')).toBe('true');
  });

  it("draws the Admin's menu with the dashboard current and no controls", () => {
    const { container } = render(<AdminDashboardMock />);

    for (const label of ['Dashboard', 'Add admission', 'Students', 'Staff']) {
      expect(screen.getAllByText(label, { selector: 'aside span' }).length).toBeGreaterThan(0);
    }
    expect(container.querySelectorAll('aside button, aside a')).toHaveLength(0);
    const current = screen.getByText('Dashboard', { selector: 'aside span' }).parentElement;
    expect(current?.className).toContain('text-primary');
  });

  it('renders the real dashboard from the fixtures', async () => {
    const { container } = render(<AdminDashboardMock />);
    await waitFor(() => {
      expect(container.textContent).toContain('Good afternoon');
    });
  });

  // The other screens are no longer reachable from the hero, but `SCREENS`
  // still maps each one to the product's real view; every one must render its
  // sample data without throwing.
  it.each(Object.keys(SCREENS))('renders the real %s screen from the fixtures', async (href) => {
    const Screen = SCREENS[href]!;
    const { container } = render(<Screen />);
    await waitFor(() => {
      expect(container.querySelector('.animate-pulse')).toBeNull();
    });
    expect(container.textContent?.length ?? 0).toBeGreaterThan(50);
  });
});
