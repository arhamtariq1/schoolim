import { brandRamp, brandThemeCss } from '@ilm/ui';

/**
 * Paints the portal in the school's own colour.
 *
 * ## One `<style>`, rendered on the server
 *
 * `theme.css` is built around this: every `--brand-*` token in it is a variable
 * rather than a literal, precisely so a tenant's colours are a runtime swap and
 * not a per-tenant CSS bundle. This is the swap — eleven custom properties and
 * two steels, redefined on the root element.
 *
 * It renders on the server, inside the shell, so the school's colour is in the
 * first byte of HTML. Doing it in an effect would paint the product's teal,
 * hydrate, and then repaint — a flash of the wrong brand on every navigation,
 * which is exactly the thing a school notices about their own colour.
 *
 * ## Why this is safe to interpolate
 *
 * `dangerouslySetInnerHTML` on a `<style>` is the only way to emit CSS text,
 * and the value reaching it has been through three gates: `brandColorSchema`
 * accepts `#rrggbb` and nothing else at the API boundary, `brandRamp` returns
 * undefined for anything it cannot parse, and what it returns is numbers
 * formatted into `oklch()` — the tenant's string never reaches the output. A
 * test asserts the emitted CSS contains no angle brackets.
 *
 * ## Why it is not `<style jsx>` or a `style` attribute
 *
 * The tokens have to land on the root element, above everything, because they
 * are read by components several levels down — and by Radix portals, which
 * render outside this tree entirely. A `style` attribute on a wrapper would
 * reach the wrapper's children and leave every dialog, dropdown and toast in
 * the product's colours.
 */
export function BrandTheme({ color }: { readonly color?: string | undefined }) {
  if (color === undefined || color === '') {
    return null;
  }

  const ramp = brandRamp(color);
  if (ramp === undefined) {
    // A value the database holds but the parser cannot read. The product's own
    // palette is a better answer than a portal with no colours in it.
    return null;
  }

  return (
    <style
      // `precedence` opts this into React 19's stylesheet handling, which
      // hoists it to <head> and — the part that matters — keeps one copy no
      // matter how many times the shell renders.
      precedence="high"
      href="brand-theme"
      dangerouslySetInnerHTML={{ __html: brandThemeCss(ramp) }}
    />
  );
}
