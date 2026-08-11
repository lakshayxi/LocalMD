export { highlightCode, renderMarkdown } from '@/platform/render/client';

/**
 * Rendering, as the app asks for it.
 *
 * Both calls go to the render worker, which is created on first use — a reader
 * who opens the landing page and leaves has downloaded no parser and started no
 * thread. The client falls back to this thread wherever a worker cannot be had.
 *
 * This module used to hold the dynamic import that kept the pipeline out of the
 * entry chunk. The worker does that now, more thoroughly: the pipeline is not
 * merely in another chunk, it is on another thread.
 */
