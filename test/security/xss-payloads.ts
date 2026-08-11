/**
 * XSS corpus for the sanitizer.
 *
 * Per the plan, allowlist drift is the expected failure mode: the schema gets
 * loosened one feature request at a time until it means nothing. This file is
 * the thing that stops that. Every payload here is untrusted Markdown input;
 * every `mustNotMatch` is a pattern that must never survive into rendered output.
 *
 * The sanitizer lands in M1. Until then this is data with a test that asserts
 * only its shape — but it is written now, deliberately, so the schema is
 * developed against it rather than the other way round.
 */

export interface XssPayload {
  name: string;
  /** Raw Markdown, treated as hostile input. */
  markdown: string;
  /** Patterns that must not appear anywhere in the rendered HTML. */
  mustNotMatch: RegExp[];
  /**
   * True when the payload hides its attack behind encoding, control characters,
   * or parser quirks, so the forbidden pattern is absent from the raw source and
   * only appears once a browser decodes it. Exempts the payload from the
   * "is this still hostile as written?" check in test/harness.test.ts.
   */
  obfuscated?: boolean;
  /** Why this one is interesting — the bypass class it represents. */
  note: string;
}

export const xssPayloads: XssPayload[] = [
  {
    name: 'script tag in raw html',
    markdown: '<script>alert(1)</script>',
    mustNotMatch: [/<script/i],
    note: 'Baseline. Raw HTML is supported, so script must be dropped by the allowlist.',
  },
  {
    name: 'javascript: url in markdown link',
    markdown: '[click](javascript:alert(1))',
    mustNotMatch: [/javascript:/i],
    note: 'Scheme allowlist on hrefs.',
  },
  {
    name: 'javascript: url with mixed case and whitespace',
    markdown: '[click](  JaVaScRiPt:alert(1))',
    mustNotMatch: [/javascript:/i],
    note: 'Scheme checks must normalize case and strip leading whitespace.',
  },
  {
    name: 'javascript: url with embedded tab',
    markdown: '<a href="java\tscript:alert(1)">click</a>',
    mustNotMatch: [/javascript:/i, /java\tscript:/i],
    obfuscated: true,
    note: 'HTML parsing strips tab/LF/CR from URLs before the scheme resolves, so "java<TAB>script:" becomes "javascript:". Naive string matching misses it.',
  },
  {
    name: 'entity-encoded javascript: url',
    markdown: '<a href="&#106;avascript:alert(1)">click</a>',
    mustNotMatch: [/javascript:/i],
    obfuscated: true,
    note: 'Entity decoding happens during HTML parsing. A sanitizer working on raw text before decoding never sees the scheme.',
  },
  {
    name: 'onerror attribute on image',
    markdown: '<img src="x" onerror="alert(1)">',
    mustNotMatch: [/onerror/i],
    note: 'All on* event handler attributes must be stripped.',
  },
  {
    name: 'onload via uppercase attribute',
    markdown: '<img src="x" ONLOAD="alert(1)">',
    mustNotMatch: [/onload/i],
    note: 'Attribute matching must be case-insensitive.',
  },
  {
    name: 'inline svg with script',
    markdown: '<svg><script>alert(1)</script></svg>',
    mustNotMatch: [/<svg/i, /<script/i],
    note: 'Raw SVG is not allowed in v1 at all — it is an XSS vector via script/animate/foreignObject.',
  },
  {
    name: 'svg foreignObject',
    markdown: '<svg><foreignObject><body onload="alert(1)"></body></foreignObject></svg>',
    mustNotMatch: [/<svg/i, /foreignObject/i, /onload/i],
    note: 'foreignObject smuggles HTML into an SVG context.',
  },
  {
    name: 'data:image/svg+xml image source',
    markdown: '![x](data:image/svg+xml;base64,PHN2Zz48c2NyaXB0PmFsZXJ0KDEpPC9zY3JpcHQ+PC9zdmc+)',
    mustNotMatch: [/data:image\/svg\+xml/i],
    note: 'data: images are allowed for raster types only. SVG data URIs execute script.',
  },
  {
    name: 'iframe embed',
    markdown: '<iframe src="https://example.com"></iframe>',
    mustNotMatch: [/<iframe/i],
    note: 'Blocked by both the allowlist and CSP frame-src none — belt and braces.',
  },
  {
    name: 'form with action',
    markdown: '<form action="https://evil.example.com"><input name="x"></form>',
    mustNotMatch: [/<form/i, /<input/i],
    note: 'Forms could exfiltrate on submit. Also blocked by CSP form-action none.',
  },
  {
    name: 'style tag',
    markdown: '<style>body { background: url(https://evil.example.com/x) }</style>',
    mustNotMatch: [/<style/i],
    note: 'CSS can trigger network requests, which is a leak even without script.',
  },
  {
    name: 'style attribute with url()',
    markdown: '<div style="background: url(https://evil.example.com/x)">x</div>',
    mustNotMatch: [/style\s*=/i],
    note: 'Same leak via attribute. All user-supplied style attributes are stripped.',
  },
  {
    name: 'meta refresh redirect',
    markdown: '<meta http-equiv="refresh" content="0;url=https://evil.example.com">',
    mustNotMatch: [/<meta/i],
    note: 'Navigates the page away, carrying nothing but still hostile.',
  },
  {
    name: 'base tag hijack',
    markdown: '<base href="https://evil.example.com/">',
    mustNotMatch: [/<base/i],
    note: 'Would reroute every relative URL. Also blocked by CSP base-uri none.',
  },
  {
    name: 'vbscript url',
    markdown: '[click](vbscript:msgbox(1))',
    mustNotMatch: [/vbscript:/i],
    note: 'Legacy scheme, still worth rejecting explicitly.',
  },
  {
    name: 'file: url',
    markdown: '[click](file:///etc/passwd)',
    mustNotMatch: [/file:\/\//i],
    note: 'Not exploitable in practice, but outside the allowlist and should not survive.',
  },
  {
    name: 'nested raw html evading naive stripping',
    markdown: '<<script>script>alert(1)<</script>/script>',
    mustNotMatch: [/<script/i],
    note: 'Defeats regex-based stripping. Proper HTML parsing (rehype-raw) handles it.',
  },
  {
    name: 'markdown image with onerror in title',
    markdown: '![x](https://example.com/a.png "onerror=alert(1)")',
    mustNotMatch: [/onerror\s*=/i],
    note: 'Title text must be attribute-escaped, not interpolated.',
  },
];
