/// <reference lib="webworker" />
import { highlightCode, renderMarkdown, sliceTree } from '@/core/markdown';
import type { Request, Response } from './protocol';

/**
 * The render worker.
 *
 * Everything expensive about turning Markdown into a tree happens here: parsing
 * a megabyte of source is a second of work, and a second of work on the main
 * thread is a second in which nothing scrolls, nothing types, and no click is
 * answered. §16's rule that no task may exceed 50ms is not reachable with that
 * work on the main thread at all, which is what decided this.
 *
 * Highlighting lives here for a subtler reason: it is fast *after* the first
 * call, and the first call compiles a grammar. That compile has to happen
 * somewhere, and here is the only place it can happen without being a 170ms
 * main-thread task.
 *
 * **The answer is posted in slices**, because moving the whole tree at once put
 * a 1.3-second deserialize back on the thread this is supposed to be
 * protecting. Meta first, so the outline and the withheld-image notice can be
 * right from the moment the first slice lands.
 *
 * The pipeline is imported, not reimplemented. There is one order of plugins in
 * this product and it is a security property; a worker with its own copy would
 * be the obvious place for the two to drift.
 */

const worker = self as unknown as DedicatedWorkerGlobalScope;

worker.onmessage = async (event: MessageEvent<Request>) => {
  const request = event.data;

  try {
    if (request.kind === 'render') {
      const { tree, frontmatter, headings, blocked } = await renderMarkdown(
        request.source,
        request.options,
      );
      const slices = sliceTree(tree);

      const meta: Response = {
        id: request.id,
        ok: true,
        kind: 'meta',
        frontmatter,
        headings,
        blocked,
        slices: slices.length,
      };
      worker.postMessage(meta);

      for (const nodes of slices) {
        const slice: Response = { id: request.id, ok: true, kind: 'slice', nodes };
        worker.postMessage(slice);
      }
      return;
    }

    const result = await highlightCode(request.language, request.code);
    const response: Response = { id: request.id, ok: true, kind: 'highlight', result };
    worker.postMessage(response);
  } catch (error) {
    // Reported rather than thrown: an unhandled rejection in here would leave
    // the caller waiting for a message that is never coming, and a document
    // that never appears is worse than one that appears unhighlighted.
    const response: Response = {
      id: request.id,
      ok: false,
      message: error instanceof Error ? error.message : 'The document could not be rendered.',
    };
    worker.postMessage(response);
  }
};
