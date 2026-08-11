import type { RenderOptions, RenderResult } from '@/core/markdown';

/**
 * Loads the Markdown pipeline on first use rather than at startup.
 *
 * unified, remark, rehype, and — mostly — parse5 (which rehype-raw needs to
 * parse embedded HTML properly) come to well over 100KB gzipped. None of it is
 * needed to show the landing page, and a reader who opens LocalMD to check
 * whether it's worth using should not pay for a parser before deciding.
 *
 * This is the payoff for making `renderMarkdown` async from the first commit:
 * the split costs one dynamic import here and changes nothing at any call site.
 *
 * The module is cached by the bundler, so repeated calls resolve immediately
 * after the first.
 */
export async function renderMarkdown(
  source: string,
  options: RenderOptions = {},
): Promise<RenderResult> {
  const { renderMarkdown: render } = await import('@/core/markdown');
  return render(source, options);
}
