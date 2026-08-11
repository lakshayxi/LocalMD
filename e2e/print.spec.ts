import { expect, test } from '@playwright/test';

/**
 * Print QA — an alpha gate item.
 *
 * Printing is how a document leaves LocalMD and becomes something a reader can
 * hand to someone else, so it is a real output rather than an afterthought. It
 * also fails in ways nothing else catches: browsers drop background colours
 * when printing, deferred content never renders, and line length is governed by
 * the page rather than the viewport.
 *
 * Chromium only. Print emulation in WebKit and Firefox does not reflect their
 * actual print pipelines closely enough for the assertions to mean anything,
 * and a test that passes for the wrong reason is worse than no test.
 */

const DOCUMENT = `# Release Notes

An opening paragraph long enough to measure a line length against, which needs
to run past the point where a browser would break it so that the measurement
reflects the actual wrapped width rather than the length of a short sentence.

## Setup

\`\`\`typescript
const highlighted: string = "code should survive printing";
\`\`\`

| Column | Value |
| ------ | ----- |
| a      | 1     |

![badge](https://img.shields.io/badge/build-passing-green)

\`\`\`mermaid
graph TD
  A[Start] --> B[End]
\`\`\`

<details>
<summary>Collapsed on screen</summary>

This text is hidden behind a disclosure on screen.

</details>

A [link to somewhere](https://example.com/deep/page) in a sentence.
`;

test.describe('print', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'print emulation is only faithful enough to assert against in Chromium',
  );

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 794, height: 1123 }); // A4 at 96dpi
    await page.goto('/');
    await page.getByRole('button', { name: 'Paste' }).click();
    await page.getByLabel('Markdown to read').fill(DOCUMENT);
    await page.getByRole('button', { name: 'Read it' }).click();
    await expect(page.getByRole('article')).toBeVisible();
    await page.emulateMedia({ media: 'print' });
  });

  test('hides application chrome', async ({ page }) => {
    await expect(page.locator('.lmd-header')).toBeHidden();
    await expect(page.getByRole('status')).toBeHidden();
  });

  test('keeps the line length readable', async ({ page }) => {
    // Left unconstrained, A4 gives ~100 characters per line, well past the
    // point where the eye loses its place returning to the next line.
    const chars = await page.evaluate(() => {
      const paragraph = [...document.querySelectorAll('.lmd-document p')].find(
        (node) => (node.textContent ?? '').length > 150,
      );
      if (!paragraph) return 0;
      const probe = document.createElement('span');
      probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap';
      probe.textContent = 'x'.repeat(100);
      paragraph.appendChild(probe);
      const perChar = probe.getBoundingClientRect().width / 100;
      probe.remove();
      return Math.round(paragraph.getBoundingClientRect().width / perChar);
    });

    expect(chars).toBeGreaterThan(55);
    expect(chars).toBeLessThan(90);
  });

  test('expands external link destinations, but not heading anchors', async ({ page }) => {
    const linkSuffix = await page.evaluate(() => {
      const link = document.querySelector('.lmd-document a[href^="http"]:not(.lmd-heading-anchor)');
      return link ? getComputedStyle(link, '::after').content : '';
    });
    expect(linkSuffix).toContain('example.com');

    // Every heading is wrapped in an anchor, so printing its href would put a
    // URL after every heading in the document.
    const headingSuffix = await page.evaluate(() => {
      const anchor = document.querySelector('.lmd-document .lmd-heading-anchor');
      return anchor ? getComputedStyle(anchor, '::after').content : '';
    });
    expect(headingSuffix === 'none' || headingSuffix === '').toBe(true);
  });

  test('reveals content collapsed behind a disclosure', async ({ page }) => {
    // A reader cannot open a <details> on paper, so leaving it closed prints an
    // incomplete document.
    await expect(page.getByText('This text is hidden behind a disclosure')).toBeVisible();
  });

  test('renders diagrams rather than printing their source', async ({ page }) => {
    // Diagrams render lazily as they approach the viewport, so anything below
    // the fold has never been drawn when printing starts.
    await expect(page.locator('.lmd-mermaid-svg svg')).toHaveCount(1);
  });

  test('explains withheld images instead of leaving a bare placeholder', async ({ page }) => {
    const note = await page.evaluate(() => {
      const blocked = document.querySelector('.lmd-blocked-image');
      return blocked ? getComputedStyle(blocked, '::after').content : '';
    });

    // "Click to load" means nothing on paper.
    expect(note).toContain('not loaded');
  });

  test('keeps code legible without background colour', async ({ page }) => {
    // Printers drop backgrounds, and Shiki's mid-tone token colours turn to
    // muddy grey, so printed code is forced to black.
    const colour = await page.evaluate(() => {
      const token = document.querySelector('.lmd-document .shiki span');
      return token ? getComputedStyle(token).color : '';
    });

    expect(colour).toBe('rgb(0, 0, 0)');
  });
});
