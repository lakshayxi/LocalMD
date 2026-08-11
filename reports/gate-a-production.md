# Gate A — production verification

Alpha deployment: <https://localmd-12t.pages.dev>

Verified 2026-08-11 03:01 UTC against the live origin by
`scripts/verify-production.mjs`. Re-run it after every deploy — the e2e suite
uses `vite preview`, which serves the built files but does not apply
`dist/_headers`, so response headers are unverified until something checks
production. That is exactly where the privacy claim could quietly become false:
the meta tag would still be present and the app would look correct while
`connect-src 'none'` was not actually enforced.

## Result

```

Verifying https://localmd-12t.pages.dev

  ok   responds 200 — status 200
  ok   served over https — https://localmd-12t.pages.dev
  ok   sends a Content-Security-Policy response header
  ok   CSP: connect-src 'none' — blocks all programmatic network egress
  ok   CSP: object-src 'none' — blocks plugin content
  ok   CSP: base-uri 'none' — stops relative URLs being rerouted
  ok   CSP: form-action 'none' — stops form submission anywhere
  ok   CSP: frame-ancestors 'none' — blocks clickjacking; header-only, never in a meta tag
  ok   CSP: script-src 'self' — no inline or third-party script
  ok   CSP does not allow inline script — unsafe-inline in script-src would void the policy
  ok   referrer-policy: no-referrer
  ok   x-content-type-options: nosniff
  ok   app boots
  ok   no console errors
  ok   loads nothing cross-origin
  ok   no service worker registered — 0 found
  ok   marked as an early build
  ok   privacy page reachable at a shareable URL
  ok   privacy page states both enforcement layers
  ok   privacy page admits the limit of the weaker layer
  ok   privacy page states all three caveats
  ok   renders a document
  ok   highlighting works on the live build
  ok   opening a document with remote images contacts nobody
  ok   remote images are withheld

25/25 checks passed

Gate A production checks passed.
```

## Response headers as served

```
content-security-policy: default-src 'self'; connect-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' blob:; font-src 'self'; object-src 'none'; frame-src 'none'; worker-src 'self' blob:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
cross-origin-opener-policy: same-origin
permissions-policy: accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()
referrer-policy: no-referrer
x-content-type-options: nosniff
```
