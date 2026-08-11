import { toHtml } from 'hast-util-to-html';
import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '@/core/markdown';
import { xssPayloads } from './xss-payloads';

async function render(markdown: string, options?: { allowRemoteContent?: boolean }) {
  const { tree } = await renderMarkdown(markdown, options ?? {});
  return toHtml(tree);
}

describe('sanitizer', () => {
  describe.each(xssPayloads)('$name', (payload) => {
    it('renders inert', async () => {
      const html = await render(payload.markdown);

      for (const pattern of payload.mustNotMatch) {
        expect(html, `${payload.note}\n\nrendered: ${html}`).not.toMatch(pattern);
      }
    });
  });

  it('never emits a form control', async () => {
    // Task-list checkboxes are the one reason <input> survives sanitization, so
    // this asserts the conversion in plugins/task-lists.ts actually happens.
    const html = await render('- [x] done\n- [ ] todo\n\n<input name="x">\n');

    expect(html).not.toMatch(/<input/i);
    expect(html).not.toMatch(/<form/i);
    expect(html).toContain('lmd-task-checkbox');
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain('aria-checked="false"');
  });

  it('strips classes impersonating LocalMD internals', async () => {
    const html = await render('<div class="lmd-blocked-image">fake</div>');

    expect(html).not.toContain('lmd-blocked-image');
    expect(html).toContain('fake');
  });

  it('drops javascript: hrefs entirely rather than blanking them', async () => {
    // An empty href still renders as a focusable link and reloads the page when
    // followed, so the attribute has to be removed, not emptied.
    const html = await render('[click](javascript:alert(1))');

    expect(html).not.toMatch(/javascript:/i);
    expect(html).not.toMatch(/href=""/);
  });
});

describe('url handling', () => {
  it('allows safe raster data URIs', async () => {
    const png = 'data:image/png;base64,iVBORw0KGgo=';
    const html = await render(`![dot](${png})`, { allowRemoteContent: true });

    expect(html).toContain(png);
  });

  it('rejects svg data URIs', async () => {
    const html = await render('![x](data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=)');

    expect(html).not.toMatch(/data:image\/svg/i);
  });

  it('preserves relative links and images', async () => {
    const html = await render('[docs](./guide.md) ![shot](./shot.png)');

    expect(html).toContain('./guide.md');
    expect(html).toContain('./shot.png');
  });

  it('hardens external links without touching in-document anchors', async () => {
    const html = await render('[out](https://example.com) [in](#section)');

    expect(html).toMatch(/rel="noopener noreferrer"/);
    expect(html).toMatch(/referrerpolicy="no-referrer"/i);
    // The anchor link must stay plain, or the outline breaks.
    expect(html).toMatch(/<a href="#section">/);
  });

  it('allows mailto links', async () => {
    const html = await render('[mail](mailto:someone@example.com)');

    expect(html).toContain('mailto:someone@example.com');
  });
});

describe('remote content gating', () => {
  const markdown = '![badge](https://img.shields.io/badge/a-b-green)';

  it('blocks remote images by default', async () => {
    const { tree, blocked } = await renderMarkdown(markdown);
    const html = toHtml(tree);

    // The URL is deliberately retained in data-src so the M2 opt-in can restore
    // the image without re-parsing. What matters is that it appears in no
    // attribute the browser will fetch — data-* is inert.
    expect(html).not.toMatch(/<img/i);
    expect(html).not.toMatch(/\ssrc=/i);
    expect(html).not.toMatch(/\ssrcset=/i);
    expect(html).toContain('data-src="https://img.shields.io/badge/a-b-green"');

    expect(blocked).toHaveLength(1);
    expect(blocked[0]?.host).toBe('img.shields.io');
    expect(blocked[0]?.alt).toBe('badge');
  });

  it('keeps the alt text readable so the placeholder still means something', async () => {
    const { tree } = await renderMarkdown('![Build status](https://img.shields.io/x)');

    expect(toHtml(tree)).toContain('>Build status<');
  });

  it('reports the host so the app can name who would be contacted', async () => {
    const { blocked } = await renderMarkdown(markdown);

    expect(blocked[0]?.url).toContain('img.shields.io');
  });

  it('loads remote images only when explicitly allowed', async () => {
    const { tree, blocked } = await renderMarkdown(markdown, { allowRemoteContent: true });
    const html = toHtml(tree);

    expect(html).toContain('img.shields.io/badge');
    expect(blocked).toHaveLength(0);
  });

  it('does not report local or data images as blocked', async () => {
    const { blocked } = await renderMarkdown(
      '![a](./local.png)\n\n![b](data:image/png;base64,iVBORw0KGgo=)',
    );

    // Relative images are unresolvable rather than withheld — a different
    // problem, and not one the remote-content prompt should offer to fix.
    expect(blocked).toHaveLength(0);
  });

  it('renders relative images as an explained placeholder, not a broken icon', async () => {
    const { tree } = await renderMarkdown('![Architecture](./diagram.png)');
    const html = toHtml(tree);

    expect(html).not.toMatch(/<img/i);
    expect(html).toContain('lmd-unresolved-image');
    expect(html).toContain('Architecture');
    expect(html).toContain('data-src="./diagram.png"');
  });

  it('leaves data images loadable', async () => {
    const { tree } = await renderMarkdown('![dot](data:image/png;base64,iVBORw0KGgo=)');

    expect(toHtml(tree)).toMatch(/<img/i);
  });
});
