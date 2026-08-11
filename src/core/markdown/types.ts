import type { Root } from 'hast';

/** Prefix reserved for LocalMD's own class names. Never valid in user content. */
export const INTERNAL_CLASS_PREFIX = 'lmd-';

/** URL schemes permitted on links. Everything else is dropped. */
export const ALLOWED_LINK_PROTOCOLS = ['http:', 'https:', 'mailto:'] as const;

/** URL schemes permitted on media sources. */
export const ALLOWED_SOURCE_PROTOCOLS = ['http:', 'https:'] as const;

/**
 * `data:` image types that are safe to inline. SVG is deliberately absent:
 * a data:image/svg+xml URI can execute script.
 */
export const ALLOWED_DATA_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/avif',
] as const;

export interface RenderOptions {
  /**
   * When false (the default), remote images and media are replaced with an
   * inert placeholder so the browser never contacts a third-party host.
   *
   * This is the application-code half of the privacy guarantee — CSP cannot
   * express it, because `img-src` must keep permitting https: for the opt-in
   * to be possible at all.
   */
  allowRemoteContent?: boolean;
}

export interface BlockedResource {
  /** The URL that was withheld. */
  url: string;
  /** Host shown to the user, so the prompt can name who would be contacted. */
  host: string;
  /** Alt text, preserved so the placeholder stays meaningful. */
  alt: string;
}

export interface RenderResult {
  /** Sanitized hast tree, ready for the React renderer. */
  tree: Root;
  /** Frontmatter source, unparsed. Rendering it is the app's decision. */
  frontmatter: string | null;
  /** Headings in document order, for the outline and the ⌘K palette. */
  headings: Heading[];
  /** Remote resources withheld during this render. Empty when none were found. */
  blocked: BlockedResource[];
}

export interface Heading {
  /** 1–6. */
  depth: number;
  /** Plain text, with inline formatting flattened. */
  text: string;
  /** Slug, deduplicated across the document. */
  id: string;
}
