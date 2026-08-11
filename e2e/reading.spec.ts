import { expect, test } from '@playwright/test';

/**
 * The read path, end to end, on every browser in the Tier 1/2 matrix.
 *
 * Kept small on purpose: the pipeline's output is covered exhaustively by unit
 * tests against the fixture corpus. What only a browser can prove is that the
 * tree actually reaches the DOM, that the interactive pieces work, and that
 * keyboard users can operate the app.
 */

const DOCUMENT = `# Release Notes

Intro paragraph with **bold** and a [link](https://example.com).

## Setup

- [x] Completed
- [ ] Pending

\`\`\`typescript
const x: number = 1;
\`\`\`

| Column | Value |
| ------ | ----- |
| a      | 1     |

## Setup

A second section with a colliding name.
`;

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Paste' }).click();
  await page.getByLabel('Markdown to read').fill(DOCUMENT);
  await page.getByRole('button', { name: 'Read it' }).click();
  // Settle before each test. `expect` auto-waits but `evaluate`/`evaluateAll`
  // do not, so without this the DOM-inspecting tests race the first render.
  await expect(page.getByRole('article')).toBeVisible();
});

test('renders the document structure', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Release Notes' })).toBeVisible();
  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.locator('.lmd-document pre code')).toContainText('const x: number = 1;');
});

test('renders task list items as inert controls, never form inputs', async ({ page }) => {
  await expect(page.locator('.lmd-task-checkbox')).toHaveCount(2);
  await expect(page.locator('.lmd-document input')).toHaveCount(0);

  const checkboxes = page.locator('.lmd-task-checkbox');
  await expect(checkboxes.first()).toHaveAttribute('aria-checked', 'true');
  await expect(checkboxes.last()).toHaveAttribute('aria-checked', 'false');
});

test('gives colliding headings distinct anchors', async ({ page }) => {
  // Duplicate slugs would silently break deep links to the second section.
  const ids = await page.locator('.lmd-document h2').evaluateAll((nodes) =>
    nodes.map((node) => node.id),
  );

  expect(ids).toHaveLength(2);
  expect(new Set(ids).size).toBe(2);
});

test('external links are hardened against referrer leakage', async ({ page }) => {
  const link = page.locator('.lmd-document a[href="https://example.com"]');

  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(link).toHaveAttribute('referrerpolicy', 'no-referrer');
});

test('wide tables scroll without the page scrolling sideways', async ({ page }) => {
  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );

  expect(overflows, 'the page scrolls horizontally').toBe(false);
  // A scrollable region unreachable by keyboard is a WCAG failure, and the one
  // most commonly missed when rendering documentation.
  await expect(page.locator('.lmd-table-scroll')).toHaveAttribute('tabindex', '0');
});

test('controls activate from the keyboard', async ({ page }) => {
  await page.getByRole('button', { name: 'Close document' }).click();
  await expect(page.getByRole('heading', { name: 'LocalMD' })).toBeVisible();

  // What we control: real <button> elements with real handlers, so focus plus
  // Enter works. A div-with-onClick would pass a click test and fail this one.
  await page.getByRole('button', { name: 'Paste' }).focus();
  await page.keyboard.press('Enter');

  await expect(page.getByLabel('Markdown to read')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Paste' })).toBeVisible();
});

test('controls are reachable by Tab', async ({ page, browserName }) => {
  // Safari omits buttons from the Tab sequence unless the user enables
  // "Press Tab to highlight each item on a webpage" — this is system-wide
  // behavior on every site, not something the page can influence. Asserting it
  // here would be testing a browser preference rather than our markup, and the
  // test above already proves the controls are keyboard-operable.
  test.skip(browserName === 'webkit', 'WebKit excludes buttons from Tab order by default');

  await page.getByRole('button', { name: 'Close document' }).click();

  const seen: (string | undefined)[] = [];
  for (let i = 0; i < 8; i += 1) {
    await page.keyboard.press('Tab');
    const label = await page.evaluate(() => document.activeElement?.textContent ?? undefined);
    seen.push(label);
    if (label === 'Paste') break;
  }

  expect(seen, 'never reached the Paste button by tabbing').toContain('Paste');
});

test('theme switches and persists across document changes', async ({ page }) => {
  const toggle = page.getByRole('button', { name: /^Theme:/ });

  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await page.getByRole('button', { name: 'Close document' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});
