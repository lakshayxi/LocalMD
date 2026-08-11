import type { Root } from 'hast';
import type { ComponentProps, ReactNode } from 'react';
import { createContext, isValidElement, useContext, useEffect, useMemo, useState } from 'react';
import { Fragment, jsx, jsxs } from 'react/jsx-runtime';
import { toJsxRuntime } from 'hast-util-to-jsx-runtime';
// Deep imports, not the barrel. `@/core/markdown` re-exports the pipeline, and
// pulling that in here would put the whole parser in the entry chunk — which is
// exactly what it did: 58KB gzipped of remark, rehype and parse5, preloaded
// before the landing page had decided whether to open anything.
import { languageOfClassNames } from '@/core/markdown/highlight';
import type { Language } from '@/core/markdown/highlight';
import { useNearViewport } from './use-near-viewport';

/**
 * Code blocks, plain first and highlighted shortly after.
 *
 * Highlighting used to happen inside the pipeline, which meant no document
 * appeared until every fence in it had been coloured. On a 45KB README with one
 * fence that cost 172ms of a 250ms render — nearly all of it Shiki compiling a
 * grammar — and it was paid again on every render, because the highlighter was
 * built and disposed each time. The reader waited for work they could not see.
 *
 * So the block renders as text immediately and upgrades itself when it comes
 * near the viewport. Nothing is lost: the plain version is the same characters
 * in the same monospace, so the upgrade is a recolouring rather than a reflow.
 *
 * **Who does the work is injected, not imported.** `src/render` may not reach
 * into `src/platform` — the boundary that keeps `core` and `render` extractable
 * — and the highlighter that matters runs in a worker, which is platform's
 * business. The app provides it; this file only decides *when* to ask.
 */

export type Highlighter = (language: Language, code: string) => Promise<Root | null>;

/** Highlighting is an enhancement, so its absence has to be a working default. */
const HighlightContext = createContext<Highlighter>(async () => null);

export function HighlightProvider({
  highlight,
  children,
}: {
  highlight: Highlighter;
  children: ReactNode;
}) {
  return <HighlightContext.Provider value={highlight}>{children}</HighlightContext.Provider>;
}

/**
 * Pulls the language and source text back out of the rendered `pre`.
 *
 * The shape is ours: the pipeline emits `<pre><code class="language-x">text`,
 * sanitized, with nothing else in between. Reading it here rather than carrying
 * a duplicate copy of every code block through the tree is what keeps a
 * code-heavy megabyte from being held in memory twice.
 */
function readCode(children: ReactNode): { language: Language; code: string } | null {
  if (!isValidElement(children)) return null;

  const props = children.props as { className?: unknown; children?: ReactNode };
  const classNames = Array.isArray(props.className)
    ? props.className
    : typeof props.className === 'string'
      ? props.className.split(' ')
      : [];

  const language = languageOfClassNames(classNames);
  if (!language) return null;

  const code = flatten(props.children);
  return code ? { language, code } : null;
}

function flatten(node: ReactNode): string {
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(flatten).join('');
  return '';
}

/**
 * A fenced block: the copy affordance, and the highlighting.
 *
 * Copying a code block is the most common thing a reader does with technical
 * documentation, and doing it by hand means selecting across a scroll region.
 */
export function CodeBlock({ children, ...rest }: ComponentProps<'pre'>) {
  const highlight = useContext(HighlightContext);
  const { ref, near } = useNearViewport<HTMLDivElement>();
  const [highlighted, setHighlighted] = useState<Root | null>(null);

  const source = useMemo(() => readCode(children), [children]);

  useEffect(() => {
    if (!near || !source || highlighted) return;
    let cancelled = false;

    void highlight(source.language, source.code).then((tree) => {
      if (!cancelled) setHighlighted(tree);
    });

    return () => {
      cancelled = true;
    };
  }, [near, source, highlighted, highlight]);

  const content = useMemo(
    () =>
      highlighted
        ? toJsxRuntime(highlighted, { Fragment, jsx, jsxs, ignoreInvalidStyle: true })
        : null,
    [highlighted],
  );

  return (
    <div className="lmd-code-block" ref={ref}>
      {content ?? <pre {...rest}>{children}</pre>}
    </div>
  );
}
