import type { Route } from 'next';

/**
 * The console's sidebar, filtered by what the signed-in operator may do.
 *
 * Same rule as the portal: an item declares the capability that reveals it, so
 * a menu entry can never lead to a 403. The UI hides; the API decides.
 */
export interface NavItem {
  readonly href: Route;
  readonly label: string;
  readonly icon: 'overview' | 'schools' | 'plans';
  readonly capability: string;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { href: '/', label: 'Overview', icon: 'overview', capability: 'schools.read' },
  { href: '/schools', label: 'Schools', icon: 'schools', capability: 'schools.read' },
  { href: '/plans', label: 'Plans & pricing', icon: 'plans', capability: 'plans.read' },
];

export function visibleNavItems(capabilities: readonly string[]): readonly NavItem[] {
  return NAV_ITEMS.filter((item) => capabilities.includes(item.capability));
}

/** `/` matches only itself; every other item stays lit on its sub-pages. */
export function isCurrent(href: string, pathname: string): boolean {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}
