import type { Root } from 'hast';
import type {
  BlockedResource,
  DocumentSlice,
  Heading,
  HighlightLanguage,
  RenderOptions,
} from '@/core/markdown';
import type { Request, Response } from './protocol';

/**
 * Talking to the render worker, or doing without one.
 *
 * The worker is created on first use, never at startup: a reader who opens the
 * landing page and leaves has downloaded no parser and started no thread.
 *
 * **Every path has a fallback that runs the same code on this thread.** Module
 * workers are absent in a few contexts and blocked in others, and a document
 * that renders slowly is enormously better than one that does not render. The
 * fallback imports the pipeline dynamically for the same reason the worker is
 * lazy — a static import would drag the parser into the entry chunk and undo
 * the split it exists to protect.
 *
 * A render resolves once every slice has arrived. Each slice is its own message
 * and therefore its own short task, which is the whole point: the main thread
 * receives the document in pieces it can absorb without missing a frame.
 */

/** A rendered document in the shape the app holds it: sliced, ready to mount. */
export interface RenderedDocument {
  slices: DocumentSlice[];
  frontmatter: string | null;
  headings: Heading[];
  blocked: BlockedResource[];
}

let worker: Worker | null | undefined;
let nextId = 0;

interface PendingRender {
  resolve: (document: RenderedDocument) => void;
  reject: (error: Error) => void;
  /** Built up by the meta message, then by each slice as it lands. */
  document: RenderedDocument | null;
  expected: number;
}

const renders = new Map<number, PendingRender>();
const highlights = new Map<
  number,
  { resolve: (tree: Root | null) => void; reject: (error: Error) => void }
>();

function failAll(error: Error): void {
  const waiting = [...renders.values(), ...highlights.values()];
  renders.clear();
  highlights.clear();
  for (const one of waiting) one.reject(error);
}

/**
 * Undefined until tried, null once we know there is no worker to be had.
 * Distinguishing the two is what stops every render retrying construction.
 */
function ensureWorker(): Worker | null {
  if (worker !== undefined) return worker;

  try {
    worker = new Worker(new URL('./render.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<Response>) => receive(event.data);

    // A worker that dies takes every request in flight with it. Failing them is
    // what lets each caller fall back; leaving them pending would hang the
    // document instead.
    worker.onerror = () => {
      worker = null;
      failAll(new Error('The render worker stopped.'));
    };
  } catch {
    worker = null;
  }

  return worker;
}

function receive(message: Response): void {
  if (!message.ok) {
    renders.get(message.id)?.reject(new Error(message.message));
    highlights.get(message.id)?.reject(new Error(message.message));
    renders.delete(message.id);
    highlights.delete(message.id);
    return;
  }

  if (message.kind === 'highlight') {
    highlights.get(message.id)?.resolve(message.result);
    highlights.delete(message.id);
    return;
  }

  const pending = renders.get(message.id);
  if (!pending) return;

  if (message.kind === 'meta') {
    pending.document = {
      slices: [],
      frontmatter: message.frontmatter,
      headings: message.headings,
      blocked: message.blocked,
    };
    pending.expected = message.slices;
    return;
  }

  // A slice with no meta ahead of it would mean the protocol had changed
  // underneath us; dropping it beats assembling a document out of order.
  if (!pending.document) return;

  pending.document.slices.push(message.slice);
  if (pending.document.slices.length < pending.expected) return;

  renders.delete(message.id);
  pending.resolve(pending.document);
}

export async function renderMarkdown(
  source: string,
  options: RenderOptions = {},
): Promise<RenderedDocument> {
  const active = ensureWorker();

  if (active) {
    try {
      return await new Promise<RenderedDocument>((resolve, reject) => {
        const id = (nextId += 1);
        renders.set(id, { resolve, reject, document: null, expected: Number.POSITIVE_INFINITY });
        const request: Request = { kind: 'render', source, options, id };
        active.postMessage(request);
      });
    } catch {
      // Falls through to this thread. Slow beats blank.
    }
  }

  const { renderMarkdown: render, sliceTreeWithHashes } = await import('@/core/markdown');
  const { tree, frontmatter, headings, blocked } = await render(source, options);
  return { slices: sliceTreeWithHashes(tree), frontmatter, headings, blocked };
}

export async function highlightCode(
  language: HighlightLanguage,
  code: string,
): Promise<Root | null> {
  const active = ensureWorker();
  if (!active) return null;

  try {
    return await new Promise<Root | null>((resolve, reject) => {
      const id = (nextId += 1);
      highlights.set(id, { resolve, reject });
      const request: Request = { kind: 'highlight', language, code, id };
      active.postMessage(request);
    });
  } catch {
    // Deliberately *not* falling back to this thread. The first call compiles a
    // grammar, which is a ~170ms task, and a reader scrolling through a
    // document full of code would feel every one of them. Plain code is a fine
    // outcome; a stuttering page is not.
    return null;
  }
}
