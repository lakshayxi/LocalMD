/**
 * Single source of truth for LocalMD's Content Security Policy.
 *
 * The production policy is the load-bearing half of the privacy guarantee:
 * `connect-src 'none'` structurally prevents programmatic network egress —
 * no fetch, XHR, WebSocket, sendBeacon, or EventSource can leave the page,
 * even if a dependency is compromised.
 *
 * It is NOT the whole guarantee. `img-src` must permit https: so that the
 * remote-image opt-in can work at all, which means remote *subresources* are
 * blocked in application code (the renderer's image gate), not by policy.
 * A bug in that gate could still produce a cross-origin request, which is why
 * e2e/privacy.spec.ts asserts zero cross-origin requests against a real build.
 * Treat that test as the enforcement mechanism, not this file.
 */

/** @type {Record<string, string[]>} */
const PROD = {
  'default-src': ["'self'"],
  // No programmatic egress. Ever.
  'connect-src': ["'none'"],
  'script-src': ["'self'"],
  // KaTeX and Shiki both emit inline style attributes. Far smaller risk than
  // inline script, and the sanitizer strips user-supplied style attributes anyway.
  'style-src': ["'self'", "'unsafe-inline'"],
  // https: is permitted so remote images *can* be loaded after explicit opt-in.
  // Default-blocking happens in the renderer. See the note above.
  'img-src': ["'self'", 'data:', 'blob:', 'https:'],
  // Deliberately stricter than img-src: we never render remote media.
  'media-src': ["'self'", 'blob:'],
  'font-src': ["'self'"],
  'object-src': ["'none'"],
  'frame-src': ["'none'"],
  'worker-src': ["'self'", 'blob:'],
  'base-uri': ["'none'"],
  'form-action': ["'none'"],
  'frame-ancestors': ["'none'"],
};

/**
 * Dev needs HMR: Vite injects inline scripts and opens a websocket back to the
 * dev server. Both are impossible under the production policy.
 *
 * This means the dev server does NOT prove the production policy works.
 * Anything verifying CSP or network behavior must run against `vite preview`
 * or a real build — never against `vite dev`.
 */
const DEV = {
  ...PROD,
  'script-src': ["'self'", "'unsafe-inline'"],
  'connect-src': ["'self'", 'ws:', 'wss:'],
  'frame-ancestors': ["'self'"],
};

/** Directives that browsers ignore inside a <meta> tag and only honor as a real header. */
const HEADER_ONLY = new Set(['frame-ancestors', 'report-uri', 'report-to', 'sandbox']);

/** @param {Record<string, string[]>} policy */
function serialize(policy) {
  return Object.entries(policy)
    .map(([directive, values]) => `${directive} ${values.join(' ')}`)
    .join('; ');
}

/** @param {Record<string, string[]>} policy */
function serializeForMeta(policy) {
  return serialize(
    Object.fromEntries(Object.entries(policy).filter(([d]) => !HEADER_ONLY.has(d))),
  );
}

export const cspProdHeader = serialize(PROD);
export const cspProdMeta = serializeForMeta(PROD);
export const cspDevHeader = serialize(DEV);

/**
 * Security headers shipped alongside the CSP. Deployed via dist/_headers
 * (Cloudflare Pages / Netlify) — see the vite plugin in vite.config.ts.
 */
export const securityHeaders = {
  'Content-Security-Policy': cspProdHeader,
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy':
    'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()',
};
