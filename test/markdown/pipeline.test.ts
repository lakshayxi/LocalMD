import { toHtml } from 'hast-util-to-html';
import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '@/core/markdown';
import { loadMarkdownFixtures } from '../fixtures';

async function html(markdown: string) {
  const { tree } = await renderMarkdown(markdown);
  return toHtml(tree);
}

describe('headings', () => {
  it('generates slugs and wraps headings in anchors', async () => {
    const result = await html('## Getting Started');

    expect(result).toContain('id="getting-started"');
    expect(result).toContain('lmd-heading-anchor');
  });

  it('deduplicates repeated heading slugs', async () => {
    const { headings } = await renderMarkdown('## Setup\n\n## Setup\n\n## Setup');
    const ids = headings.map((h) => h.id);

    expect(new Set(ids).size).toBe(3);
    expect(ids[0]).toBe('setup');
  });

  it('reports headings in document order with depth and text', async () => {
    const { headings } = await renderMarkdown('# One\n\n### Three\n\n## Two');

    expect(headings).toEqual([
      { depth: 1, text: 'One', id: 'one' },
      { depth: 3, text: 'Three', id: 'three' },
      { depth: 2, text: 'Two', id: 'two' },
    ]);
  });

  it('flattens inline formatting in heading text', async () => {
    const { headings } = await renderMarkdown('## The `render` **step**');

    expect(headings[0]?.text).toBe('The render step');
  });
});

describe('gfm', () => {
  it('renders tables with alignment', async () => {
    const result = await html('| a | b |\n| :-- | --: |\n| 1 | 2 |');

    expect(result).toContain('<table>');
    expect(result).toMatch(/align="right"|text-align:right/);
  });

  it('renders strikethrough and autolinks', async () => {
    const result = await html('~~gone~~ and https://example.com');

    expect(result).toContain('<del>');
    expect(result).toContain('href="https://example.com"');
  });

  it('renders footnotes with backreferences', async () => {
    const result = await html('Text[^1]\n\n[^1]: The note.');

    expect(result).toContain('<section');
    expect(result).toContain('footnotes');
    expect(result).toContain('The note.');
  });
});

describe('frontmatter', () => {
  it('captures frontmatter without rendering it into the document', async () => {
    const { tree, frontmatter } = await renderMarkdown('---\ntitle: Hi\n---\n\n# Body');

    expect(frontmatter).toBe('title: Hi');
    expect(toHtml(tree)).not.toContain('title: Hi');
    expect(toHtml(tree)).toContain('Body');
  });

  it('reports null when there is no frontmatter', async () => {
    const { frontmatter } = await renderMarkdown('# Just a heading');

    expect(frontmatter).toBeNull();
  });
});

describe('code blocks', () => {
  it('preserves the language hint for the highlighter', async () => {
    const result = await html('```typescript\nconst x = 1;\n```');

    expect(result).toContain('language-typescript');
  });

  it('renders an unknown language as plain code rather than failing', async () => {
    const result = await html('```notarealanguage\nx\n```');

    expect(result).toContain('<code');
    expect(result).toContain('x');
  });

  it('escapes html inside code blocks', async () => {
    const result = await html('```\n<script>alert(1)</script>\n```');

    expect(result).not.toMatch(/<script/);
    expect(result).toContain('&#x3C;script>');
  });
});

describe('fixture corpus', () => {
  it.each(loadMarkdownFixtures())('renders $name without throwing', async (fixture) => {
    const { tree, headings } = await renderMarkdown(fixture.source);

    expect(tree.children.length).toBeGreaterThan(0);
    // Every heading must get an id, or the outline and deep links break.
    for (const heading of headings) {
      expect(heading.id, `heading "${heading.text}" has no slug`).not.toBe('');
    }
  });

  it.each(loadMarkdownFixtures())('emits no script or event handlers for $name', async (fixture) => {
    const { tree } = await renderMarkdown(fixture.source);
    const result = toHtml(tree);

    expect(result).not.toMatch(/<script/i);
    expect(result).not.toMatch(/\son[a-z]+=/i);
    expect(result).not.toMatch(/javascript:/i);
  });
});
