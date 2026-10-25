/**
 * The three hundred bytes that decide whether this page animates at all.
 *
 * ## Why it is an inline script and not an effect
 *
 * The reveal states in `globals.css` are gated on
 * `html[data-marketing-motion='on']`, and the attribute has to be set **before
 * the first paint** or the hero flashes in at full opacity and then animates
 * from nothing — which is worse than no animation at all. A `useEffect` or even
 * a `useLayoutEffect` runs after that paint. A script tag placed above the
 * content does not: the parser stops, runs it, and carries on with the
 * attribute already in place.
 *
 * `BrandTheme` takes the same route for the same reason (a `<style>` that has
 * to exist before the markup it styles), so this is a pattern the repository
 * already has rather than one this page invents.
 *
 * ## Why the observer is in here too, and not in the React island
 *
 * This script is what hides things. If it is also what reveals them, there is
 * no arrangement of failures that can leave the page blank:
 *
 * | What breaks            | What the visitor sees                              |
 * | ---------------------- | -------------------------------------------------- |
 * | JavaScript disabled    | The whole page, static. Nothing was ever hidden     |
 * | Reduced motion asked   | The whole page, static. The attribute is not set    |
 * | No `IntersectionObserver` | The whole page, static                           |
 * | This script throws     | The `catch` removes the attribute. Static           |
 * | React never hydrates   | Reveals work; only smooth scrolling is missing      |
 *
 * The last row is the one that justifies the split. Lenis lives in a client
 * component, and a hydration failure there would otherwise take the page's
 * legibility down with it.
 *
 * ## The sweep, and why it lives here rather than in the island
 *
 * That table had a hole, and it was reported from the wild: a headline that
 * never appeared. Every row above assumes the observer either runs or never
 * gets the chance to hide anything. It says nothing about the case where this
 * script hides the page and the reveal then fails — nodes swapped out from
 * under the observer after a hydration mismatch (a DOM-mutating browser
 * extension is enough to cause one), a stale module after a hot reload, a
 * starved main thread. In every one of those the visitor is left reading
 * nothing, with no error anywhere.
 *
 * So the script that hides is also the script that gives up. After
 * `SWEEP_AFTER_MS` anything still hidden inside the viewport is simply shown.
 * It is in **this** script, not in the React island, for exactly the reason
 * the split exists: this one is known to have run — if it had not, nothing
 * would be hidden in the first place. A failsafe that depends on hydration
 * cannot cover a hydration failure.
 *
 * Below-fold reveals are left alone, so the page still animates as designed.
 */

/**
 * How long the page may hide text before it stops trying to be clever.
 *
 * Long enough that a normal load reveals through the observer and this never
 * fires; short enough that nobody reads a blank page. The reveal transition is
 * itself 700ms, so anything under about a second would race it.
 */
const SWEEP_AFTER_MS = 2500;

/**
 * Written as ES5 with `var` and index loops on purpose: it is not compiled,
 * transpiled or polyfilled — it is a string handed to a browser, and the oldest
 * phone that reaches this page is the one it most needs to work on.
 */
const BOOTSTRAP = `(function () {
  var root = document.documentElement;
  try {
    var query = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (query.matches || !('IntersectionObserver' in window)) { return; }

    root.setAttribute('data-marketing-motion', 'on');

    var observer = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].isIntersecting) {
          entries[i].target.classList.add('is-visible');
          observer.unobserve(entries[i].target);
        }
      }
    }, { threshold: 0.08, rootMargin: '0px 0px -8% 0px' });

    var observe = function () {
      var nodes = document.querySelectorAll('[data-reveal],[data-rule],[data-reveal-words]');
      for (var i = 0; i < nodes.length; i++) { observer.observe(nodes[i]); }
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', observe);
    } else {
      observe();
    }

    // The failsafe. Nothing inside the viewport may stay hidden past this.
    window.setTimeout(function () {
      var nodes = document.querySelectorAll('[data-reveal],[data-rule],[data-reveal-words]');
      for (var i = 0; i < nodes.length; i++) {
        var box = nodes[i].getBoundingClientRect();
        if (box.top < window.innerHeight && box.bottom > 0) {
          nodes[i].classList.add('is-visible');
        }
      }
    }, ${String(SWEEP_AFTER_MS)});
  } catch (error) {
    root.removeAttribute('data-marketing-motion');
  }
})();`;

/**
 * Renders above the page content, so the attribute is set before any of it is
 * parsed. Server Component — it ships no React to the browser at all.
 */
export function MarketingBootstrap() {
  return <script dangerouslySetInnerHTML={{ __html: BOOTSTRAP }} />;
}
