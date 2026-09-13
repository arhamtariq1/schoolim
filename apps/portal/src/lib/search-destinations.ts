import { visibleNavItems, type NavItem } from './navigation';

/**
 * The navigation tree, flattened into the places ⌘K can take you.
 *
 * ## Why this is not in the palette component
 *
 * It is pure: a tree in, a list out, no hooks and no fetching. Keeping it here
 * means it can be tested without mounting a client component — and more to the
 * point, it means the palette and the sidebar are provably reading the same
 * tree. Two lists of pages maintained separately is how a screen ends up in one
 * and not the other.
 */

/** One destination, with the section it belongs to. */
export interface Destination {
  readonly href: string;
  readonly label: string;
  readonly icon: string;
  /** The parent's label — "Fees", "Attendance" — or undefined at the top. */
  readonly section: string | undefined;
  /** Lower-cased haystack, built once rather than on every keystroke. */
  readonly haystack: string;
}

/**
 * Every page a set of permissions can actually open.
 *
 * A branch with children is a heading — `/fees` only redirects — so it
 * contributes its name to its children and nothing of its own. Without that,
 * searching "fees" offers a row that expands a menu rather than opening a page.
 *
 * The sidebar is a tree because structure helps when browsing. Nobody browses a
 * palette — they type three letters and press Enter — so this is flat, and each
 * leaf carries its parent's name to tell two similar page names apart.
 */
export function searchDestinations(permissions: readonly string[]): Destination[] {
  return flatten(visibleNavItems(permissions));
}

/** Exported for the tests, which build trees the real navigation does not have. */
export function flatten(items: readonly NavItem[], section?: string): Destination[] {
  const out: Destination[] = [];

  for (const item of items) {
    const children = item.children ?? [];

    if (children.length > 0) {
      out.push(...flatten(children, item.label));
      continue;
    }

    out.push({
      href: item.href,
      label: item.label,
      icon: item.icon,
      section,
      // The section and the path are in the haystack too, so "fees def" finds
      // Defaulters and somebody who knows the URL can type that instead.
      haystack: `${item.label} ${section ?? ''} ${item.href}`.toLowerCase(),
    });
  }

  return out;
}
