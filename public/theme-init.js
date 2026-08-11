/**
 * Applies the saved theme and typeface before first paint.
 *
 * Loaded as a blocking classic script in <head>. Without it, the page renders
 * with default (light) styling and then snaps to dark once React mounts — a
 * white flash on every load, which is exactly the kind of detail that makes an
 * otherwise careful reader distrust the rest.
 *
 * A separate file rather than an inline script because the CSP is
 * `script-src 'self'` with no unsafe-inline. Relaxing that for a theme flicker
 * would trade the strongest line in the security policy for a cosmetic fix.
 *
 * Kept deliberately tiny and dependency-free: it runs before anything else and
 * must never be the reason a page fails to load. Anything it cannot do is
 * corrected a few milliseconds later when the app hydrates.
 *
 * The storage key and shape are owned by src/platform/persistence/prefs.ts.
 */
(function () {
  try {
    var raw = localStorage.getItem('localmd.prefs');
    if (!raw) return;

    var prefs = JSON.parse(raw);
    var root = document.documentElement;

    // 'system' and 'sans' are the defaults expressed in CSS, so they are
    // represented by the absence of the attribute rather than a value.
    if (prefs.theme === 'light' || prefs.theme === 'dark') {
      root.setAttribute('data-theme', prefs.theme);
    }
    if (prefs.typeface === 'serif') {
      root.setAttribute('data-typeface', 'serif');
    }
  } catch {
    // Storage disabled, quota errors, malformed JSON. The app corrects itself
    // on hydrate; never let this break the page.
  }
})();
