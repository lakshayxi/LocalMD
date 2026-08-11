import type { Element, Root } from 'hast';
import { visit } from 'unist-util-visit';
import {
  ALLOWED_DATA_IMAGE_TYPES,
  ALLOWED_LINK_PROTOCOLS,
  ALLOWED_SOURCE_PROTOCOLS,
  INTERNAL_CLASS_PREFIX,
} from '../types';

/**
 * Removes dangerous URLs and impersonating class names before sanitization.
 *
 * rehype-sanitize enforces a *scheme* allowlist, which is necessary but not
 * sufficient in two places:
 *
 *  1. `data:` URIs. Sanitize can only see the scheme, not the MIME type, so it
 *     cannot distinguish an inline PNG from `data:image/svg+xml`, which
 *     executes script. This resolves the type here so sanitize's permissive
 *     `data` entry is safe for whatever survives.
 *
 *  2. Obfuscated schemes. Browsers strip tab, newline, and carriage return from
 *     URLs before resolving them, so `java\tscript:` becomes `javascript:`.
 *     Normalizing first means the scheme check sees what the browser will see.
 */

// C0 controls plus DEL. Browsers strip tab/LF/CR from URLs before resolving
// them; the rest are stripped too, since none are legal in a URL and each is
// a potential obfuscation vector.
// eslint-disable-next-line no-control-regex -- matching them is the entire point
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

function normalize(url: string): string {
  // Order matters: strip control characters first, because they are what hides
  // the scheme, then trim. HTML entity decoding has already happened during
  // parsing, so by this point the URL is in its final form.
  return url.replace(CONTROL_CHARS, '').trim();
}

function isSafeDataImage(url: string): boolean {
  const match = /^data:([^;,]+)[;,]/i.exec(url);
  const mime = match?.[1]?.toLowerCase().trim();
  return mime !== undefined && (ALLOWED_DATA_IMAGE_TYPES as readonly string[]).includes(mime);
}

function protocolOf(url: string): string | null {
  // Relative URLs have no protocol and are always allowed — they cannot
  // reference another origin.
  if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) return null;
  return url.slice(0, url.indexOf(':') + 1).toLowerCase();
}

function isAllowed(url: string, allowed: readonly string[]): boolean {
  const protocol = protocolOf(url);
  if (protocol === null) return true;
  if (protocol === 'data:') return isSafeDataImage(url);
  return allowed.includes(protocol);
}

/** Attributes carrying a URL, and the scheme allowlist that applies to each. */
const URL_ATTRIBUTES: Record<string, readonly string[]> = {
  href: ALLOWED_LINK_PROTOCOLS,
  src: ALLOWED_SOURCE_PROTOCOLS,
  cite: ALLOWED_LINK_PROTOCOLS,
  srcSet: ALLOWED_SOURCE_PROTOCOLS,
};

function stripImpersonatingClasses(node: Element): void {
  const className = node.properties?.['className'];
  if (!Array.isArray(className)) return;

  const safe = className.filter(
    (name) => typeof name !== 'string' || !name.startsWith(INTERNAL_CLASS_PREFIX),
  );
  if (safe.length !== className.length) node.properties['className'] = safe;
}

export function guardUrls() {
  return (tree: Root): void => {
    visit(tree, 'element', (node: Element) => {
      if (!node.properties) return;

      stripImpersonatingClasses(node);

      for (const [attribute, allowed] of Object.entries(URL_ATTRIBUTES)) {
        const value = node.properties[attribute];
        if (typeof value !== 'string') continue;

        const normalized = normalize(value);
        if (isAllowed(normalized, allowed)) {
          node.properties[attribute] = normalized;
        } else {
          // Delete rather than blank: an empty href still renders as a link and
          // an empty src triggers a request to the current page in some browsers.
          delete node.properties[attribute];
        }
      }
    });
  };
}
