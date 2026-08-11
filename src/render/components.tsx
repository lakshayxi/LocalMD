import type { ComponentProps, ReactNode } from 'react';
import type { Components } from 'hast-util-to-jsx-runtime';
import { Mermaid } from './Mermaid';

/**
 * Component overrides for rendered Markdown.
 *
 * Kept deliberately thin. Anything expressible in CSS — task checkboxes,
 * blocked-image placeholders, heading anchors — is styled rather than
 * componentized, because every override here is a place where rendering can
 * diverge from what the pipeline tests assert about the tree.
 *
 * The overrides that do exist earn it by needing behavior, not appearance.
 */

/**
 * Adds a copy button to fenced code.
 *
 * Copying a code block is the single most common thing a reader does with
 * technical documentation, and doing it by hand means selecting across a scroll
 * region. Syntax highlighting replaces the inner content in M2; this wrapper is
 * where it will attach.
 */
function Pre(props: ComponentProps<'pre'>) {
  return (
    <div className="lmd-code-block">
      <pre {...props} />
    </div>
  );
}

/**
 * Tables can exceed the prose measure, so they scroll inside their own
 * container rather than forcing the page to scroll horizontally.
 *
 * `tabIndex={0}` is not decoration: a scrollable region that cannot be reached
 * by keyboard is a WCAG failure, and it is the most commonly missed one in
 * documentation rendering.
 */
function Table(props: ComponentProps<'table'>) {
  return (
    <div className="lmd-table-scroll" tabIndex={0} role="region" aria-label="Table">
      <table {...props} />
    </div>
  );
}

/**
 * The pipeline marks Mermaid fences with a class and leaves the source as text
 * (see core/markdown/plugins/mermaid.ts). Rendering needs a DOM, so it happens
 * here rather than in the pipeline, which stays worker-ready.
 */
function Div({ className, children, ...rest }: ComponentProps<'div'>) {
  const classes = typeof className === 'string' ? className.split(' ') : [];

  if (classes.includes('lmd-mermaid')) {
    return <Mermaid source={extractText(children)} />;
  }

  return (
    <div className={className} {...rest}>
      {children}
    </div>
  );
}

function extractText(children: ReactNode): string {
  if (typeof children === 'string') return children;
  if (Array.isArray(children)) return children.map(extractText).join('');
  return '';
}

export const components: Components = {
  pre: Pre,
  table: Table,
  div: Div,
};
