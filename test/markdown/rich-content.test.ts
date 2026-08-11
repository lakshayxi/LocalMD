import { toHtml } from 'hast-util-to-html';
import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '@/core/markdown';

async function html(markdown: string) {
  const { tree } = await renderMarkdown(markdown);
  return toHtml(tree);
}

describe('math', () => {
  it('renders inline math delimited by double dollars', async () => {
    const result = await html('The cost is $$O(n \\log n)$$ overall.');

    expect(result).toContain('katex');
  });

  it('leaves currency and shell variables alone', async () => {
    // The reason single-dollar math is disabled. With it on, remark-math reads
    // the span between two dollar signs as a formula and renders the prose as
    // mangled glyphs — a silent corruption of very common documentation text.
    const result = await html('Costs $5.00 and $6.00. Check $PATH and ${HOME}.');

    expect(result).not.toContain('katex');
    expect(result).toContain('$5.00');
    expect(result).toContain('$PATH');
  });

  it('renders display math', async () => {
    const result = await html('$$\n\\frac{a}{b}\n$$');

    expect(result).toContain('katex');
  });

  it('degrades malformed math instead of taking the document down', async () => {
    // throwOnError: false only holds if the VFile is threaded through to
    // rehype-katex; without it the error path throws and the whole render dies.
    const result = await html('# Title\n\n$$\n\\frac{\\unknown_command{\n$$\n\nAfter.');

    expect(result).toContain('Title');
    expect(result).toContain('After.');
  });

  it('does not load KaTeX for documents without math', async () => {
    const result = await html('# Just prose\n\nNo formulas anywhere in this one.');

    expect(result).not.toContain('katex');
  });

  it('refuses \\href, which would reintroduce link surface', async () => {
    const result = await html('$$\\href{https://evil.example.com}{click}$$');

    expect(result).not.toContain('evil.example.com');
  });
});

describe('mermaid', () => {
  it('marks mermaid fences for post-mount rendering', async () => {
    const result = await html('```mermaid\ngraph TD\n  A --> B\n```');

    expect(result).toContain('lmd-mermaid');
    // Source stays in the tree so a failed render, a print, or a JS-less read
    // still shows something rather than an empty gap.
    expect(result).toContain('graph TD');
  });

  it('does not try to highlight mermaid as a language', async () => {
    const result = await html('```mermaid\ngraph TD\n  A --> B\n```');

    expect(result).not.toContain('shiki');
  });

  it('escapes hostile content inside a mermaid fence', async () => {
    const result = await html('```mermaid\n<script>alert(1)</script>\n```');

    expect(result).not.toMatch(/<script/i);
  });
});

describe('lazy loading', () => {
  it('renders a plain document without pulling in any heavy dependency', async () => {
    const result = await html('# Title\n\nJust prose and a [link](https://example.com).');

    expect(result).not.toContain('shiki');
    expect(result).not.toContain('katex');
    expect(result).not.toContain('lmd-mermaid');
  });
});
