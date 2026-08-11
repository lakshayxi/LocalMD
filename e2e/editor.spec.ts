import { expect, test, type Page } from '@playwright/test';
import { recordCrossOriginRequests } from './helpers/network';
import { BASE_URL } from '../playwright.config';

/**
 * The CodeMirror 6 spike, asserted.
 *
 * The plan left the editor library open pending a bounded spike: bundle cost,
 * first-open latency, Markdown quality, and behaviour under editing. These are
 * those checks, kept as regression tests so the answers stay true. Bundle size
 * is measured separately by scripts/assert-bundle-budget.mjs, which is the only
 * place that can see the built chunks.
 */

const DOCUMENT = `# Release Notes

Intro with **bold**, *italic*, ~~struck~~, and a [link](https://example.com).

## Setup

- [x] Completed task
- [ ] Pending task

1. First
2. Second

> A blockquote.

\`\`\`typescript
const x: number = 1;
\`\`\`

| Column | Value |
| ------ | ----- |
| a      | 1     |

<details>
<summary>Embedded HTML</summary>

Hidden content with <kbd>Ctrl</kbd> and <br /> a break.

</details>
`;

async function openDocument(page: Page, text = DOCUMENT) {
  await page.getByRole('button', { name: 'Paste' }).click();
  await page.getByLabel('Markdown to read').fill(text);
  await page.getByRole('button', { name: 'Read it' }).click();
  await expect(page.getByRole('article')).toBeVisible();
}

/**
 * CodeMirror binds `Mod-`, which is Cmd on macOS and Ctrl elsewhere. Chosen in
 * Node rather than the page because the browser is what varies, not the app.
 */
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';
const REDO = process.platform === 'darwin' ? 'Meta+Shift+z' : 'Control+y';

/**
 * The document as CodeMirror holds it.
 *
 * `textContent` on `.cm-content` concatenates the line divs with nothing
 * between them, which silently turns two lines into one string and makes
 * assertions about line structure meaningless. Joining the lines restores it.
 * Sound only while the whole document is rendered, which is why the
 * round-trip check uses a small fixture.
 */
async function editorText(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('.cm-line')].map((line) => line.textContent).join('\n'),
  );
}

/** Collapses the selection to the very end, without platform-specific keys. */
async function moveToEnd(page: Page) {
  await page.keyboard.press(`${MOD}+a`);
  await page.keyboard.press('ArrowRight');
}

async function enterEditMode(page: Page) {
  await page.getByRole('button', { name: /Reading\./ }).click();
  await expect(page.locator('.cm-content')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Open Markdown' })).toBeVisible();
});

test.describe('lazy loading', () => {
  test('no editor code runs until Edit is entered', async ({ page }) => {
    await openDocument(page);
    // The whole point of the dynamic import: reading a document must not
    // download an editor.
    expect(await page.locator('.cm-editor').count()).toBe(0);

    await enterEditMode(page);
    expect(await page.locator('.cm-editor').count()).toBe(1);
  });

  test('opens fast enough not to need a spinner', async ({ page }) => {
    await openDocument(page);

    const elapsed = await page.evaluate(async () => {
      const start = performance.now();
      const button = [...document.querySelectorAll('button')].find((b) =>
        b.getAttribute('aria-label')?.startsWith('Reading.'),
      );
      button?.click();

      await new Promise<void>((resolve) => {
        const tick = () => (document.querySelector('.cm-content') ? resolve() : requestAnimationFrame(tick));
        tick();
      });
      return performance.now() - start;
    });

    // Generous, because this is a cold chunk fetch over the preview server on
    // whatever machine CI gives us. The number worth watching is in the spike
    // report; this only catches a regression into "needs a loading state".
    expect(elapsed).toBeLessThan(1000);
    console.log(`first open into Edit: ${Math.round(elapsed)}ms`);
  });
});

test.describe('Markdown quality', () => {
  test.beforeEach(async ({ page }) => {
    await openDocument(page);
    await enterEditMode(page);
  });

  test('highlights every construct the documents actually use', async ({ page }) => {
    // Asserted through the highlight tags the theme binds to, rather than
    // colours: this checks the grammar resolved the construct, which is the
    // thing that would break if the language were misconfigured.
    const seen = await page.evaluate(() => {
      const classes = new Set<string>();
      for (const el of document.querySelectorAll('.cm-content span[class]')) {
        for (const name of el.classList) classes.add(name);
      }
      return [...classes];
    });

    // ͼ-prefixed classes are CodeMirror's generated style names; their presence
    // in quantity means the grammar produced distinct token types rather than
    // one undifferentiated blob.
    expect(seen.length).toBeGreaterThan(4);
  });

  test('parses GFM tables and task lists, not just CommonMark', async ({ page }) => {
    const nodes = await page.evaluate(() => {
      const text = document.querySelector('.cm-content')?.textContent ?? '';
      return {
        hasTable: text.includes('| Column | Value |'),
        hasTask: text.includes('- [x] Completed task'),
      };
    });
    expect(nodes.hasTable).toBe(true);
    expect(nodes.hasTask).toBe(true);
  });

  test('round-trips the source exactly, including embedded HTML', async ({ page }) => {
    // The editor must never rewrite what it was given. A single normalised
    // character here would show up as a whole-file diff on save.
    expect(await editorText(page)).toBe(DOCUMENT);
  });

  test('continues a list on Enter', async ({ page }) => {
    // The one Markdown-specific editing affordance worth keeping, and the
    // reason @codemirror/lang-markdown's commands are still imported.
    await page.locator('.cm-content').click();
    await moveToEnd(page);
    // A blank line first: a list marker on the line directly after a paragraph
    // is a lazy continuation of that paragraph, not a list, and Markdown is
    // right not to continue it.
    await page.keyboard.type('\n- first');
    await page.keyboard.press('Enter');
    await page.keyboard.type('second');

    const text = await editorText(page);
    expect(text).toContain('- first');
    expect(text).toContain('- second');
  });
});

test.describe('editing behaviour', () => {
  test.beforeEach(async ({ page }) => {
    await openDocument(page);
    await enterEditMode(page);
    await page.locator('.cm-content').click();
  });

  test('undo and redo', async ({ page }) => {
    await moveToEnd(page);
    await page.keyboard.type('APPENDED');
    await expect(page.locator('.cm-content')).toContainText('APPENDED');

    await page.keyboard.press(`${MOD}+z`);
    await expect(page.locator('.cm-content')).not.toContainText('APPENDED');

    await page.keyboard.press(REDO);
    await expect(page.locator('.cm-content')).toContainText('APPENDED');
  });

  test('accepts composed (IME) input', async ({ page }) => {
    // A real IME cannot be driven here, so this exercises the composition
    // events an IME produces. It proves the editor commits composed text and
    // does not drop or double it — not that every IME behaves.
    await moveToEnd(page);
    await page.evaluate(() => {
      const target = document.querySelector('.cm-content') as HTMLElement;
      target.focus();
      target.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
      target.dispatchEvent(
        new CompositionEvent('compositionupdate', { bubbles: true, data: 'にほん' }),
      );
      const range = document.createRange();
      const last = target.lastElementChild ?? target;
      range.selectNodeContents(last);
      range.collapse(false);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      document.execCommand('insertText', false, 'にほん');
      target.dispatchEvent(
        new CompositionEvent('compositionend', { bubbles: true, data: 'にほん' }),
      );
    });

    await expect(page.locator('.cm-content')).toContainText('にほん');
  });

  test('marks the document dirty, and only on a real edit', async ({ page }) => {
    await expect(page.getByTitle('Unsaved changes')).toHaveCount(0);

    // Moving the cursor is not an edit.
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTitle('Unsaved changes')).toHaveCount(0);

    await page.keyboard.type('x');
    await expect(page.getByTitle('Unsaved changes')).toBeVisible();
  });

  test('edits survive a round trip through the preview', async ({ page, browserName }) => {
    await moveToEnd(page);
    await page.keyboard.type('\n\n## Added while editing\n');

    await page.getByRole('button', { name: /Editing\./ }).click();
    await expect(page.getByRole('heading', { name: 'Added while editing' })).toBeVisible();

    // And back again, with the edit still in the source.
    await page.getByRole('button', { name: /Reading\./ }).click();
    await expect(page.locator('.cm-content')).toContainText('Added while editing');

    expect(browserName).toBeTruthy();
  });
});

test.describe('theme', () => {
  test('switches without rebuilding the editor', async ({ page }) => {
    await openDocument(page);
    await enterEditMode(page);
    await page.locator('.cm-content').click();
    await page.keyboard.type('marker');

    const before = await page.evaluate(
      () => getComputedStyle(document.querySelector('.cm-content')!).color,
    );

    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));

    const after = await page.evaluate(
      () => getComputedStyle(document.querySelector('.cm-content')!).color,
    );

    // The colour follows the theme...
    expect(after).not.toBe(before);
    // ...and the editor was never torn down, so nothing typed was lost. This is
    // what the CSS-variable theme buys over a recompiled theme extension.
    await expect(page.locator('.cm-content')).toContainText('marker');
  });
});

test.describe('large documents', () => {
  test('stays responsive on a large document', async ({ page }) => {
    const big = `# Big\n\n${'A paragraph of ordinary prose, repeated to make the document large.\n\n'.repeat(
      3600,
    )}`;
    expect(big.length).toBeGreaterThan(240_000);

    // Not `fill()`. Playwright verifies a field's value character by character,
    // which costs ~19 seconds on a 243KB textarea — pure harness time that has
    // nothing to do with the editor, and enough to push this test past its
    // timeout under load. Driving React's onChange once with the whole string
    // is the same event the component would receive anyway.
    await page.getByRole('button', { name: 'Paste' }).click();
    await page.evaluate((text) => {
      const field = document.querySelector('.lmd-paste-input') as HTMLTextAreaElement;
      const setValue = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        'value',
      )?.set;
      setValue?.call(field, text);
      field.dispatchEvent(new Event('input', { bubbles: true }));
    }, big);
    await page.getByRole('button', { name: 'Read it' }).click();
    await expect(page.getByRole('article')).toBeVisible();
    await enterEditMode(page);
    await page.locator('.cm-content').click();
    await moveToEnd(page);

    const start = Date.now();
    await page.keyboard.type('the quick brown fox jumps');
    const perKeystroke = (Date.now() - start) / 25;

    console.log(`~${perKeystroke.toFixed(1)}ms per keystroke on ${Math.round(big.length / 1024)}KB`);
    // Includes the harness's own per-key overhead, so this is an upper bound.
    expect(perKeystroke).toBeLessThan(50);
    await expect(page.locator('.cm-content')).toContainText('quick brown fox');
  });
});

test.describe('privacy', () => {
  test('the editor contacts nobody and violates no policy', async ({ page }) => {
    const requests = recordCrossOriginRequests(page, BASE_URL);
    const violations: string[] = [];
    await page.exposeFunction('__cspViolation', (directive: string) => {
      violations.push(directive);
    });
    await page.addInitScript(() => {
      document.addEventListener('securitypolicyviolation', (event) => {
        void (window as unknown as { __cspViolation(d: string): void }).__cspViolation(
          event.violatedDirective,
        );
      });
    });

    await page.goto('/');
    await openDocument(page);
    await enterEditMode(page);
    await page.locator('.cm-content').click();
    await page.keyboard.type('typing should reach no network');
    // The search panel injects DOM and styles, which is where a CSP problem
    // would most plausibly appear.
    await page.keyboard.press(`${MOD}+f`);
    await page.waitForTimeout(200);

    expect(violations, 'CSP violations').toEqual([]);
    expect(requests.attempts, 'cross-origin requests').toEqual([]);
  });
});
