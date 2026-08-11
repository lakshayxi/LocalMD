import type { Root, RootContent } from 'hast';
import type { BlockedResource, Heading, Language, RenderOptions } from '@/core/markdown';

/**
 * What the main thread and the render worker say to each other.
 *
 * Deliberately two operations and nothing else. A worker that grew a general
 * "run this" interface would be a second place where the pipeline's order could
 * be assembled wrongly, and that order — sanitize, then generate — is a
 * security property. The worker runs the one pipeline, or highlights one block.
 *
 * **A render answers in pieces.** The first version of this posted the finished
 * tree as a single message and undid most of its own benefit: deserializing a
 * megabyte's worth of nodes blocked the main thread for 1.3 seconds, which is
 * worse than the parse the worker exists to move. Slices arrive as separate
 * messages, each its own short task, and the reader's document is assembled
 * from them.
 *
 * Nothing that crosses here is a capability: document text goes one way and a
 * sanitized tree comes back. The tree is plain data by construction, which is
 * what lets it survive structured clone at all.
 */

/** What is being asked for, before the id that lets an answer find its caller. */
export type Ask =
  | { kind: 'render'; source: string; options: RenderOptions }
  | { kind: 'highlight'; language: Language; code: string };

export type Request = Ask & { id: number };

export type Response =
  /** Everything about the document that is not the document. Sent first. */
  | {
      id: number;
      ok: true;
      kind: 'meta';
      frontmatter: string | null;
      headings: Heading[];
      blocked: BlockedResource[];
      slices: number;
    }
  /** One slice of top-level blocks, in document order. */
  | { id: number; ok: true; kind: 'slice'; nodes: RootContent[] }
  | { id: number; ok: true; kind: 'highlight'; result: Root | null }
  | { id: number; ok: false; message: string };
