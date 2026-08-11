import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Automated accessibility pass over every surface.
 *
 * axe catches the mechanical failures — contrast, names, roles, structure —
 * which is most of what regresses silently during a refactor. It does not catch
 * whether the app is *operable* by keyboard; that is asserted directly in
 * navigate.spec.ts, and the two together are the a11y gate.
 *
 * Scoped to WCAG 2 A/AA, which is the standard the plan commits to.
 */

const STANDARD = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

const DOCUMENT = `# Release Notes

Intro with **bold**, a [link](https://example.com), and \`code\`.

## Setup

- [x] Done
- [ ] Pending

\`\`\`ts
const x: number = 1;
\`\`\`

| Column | Value |
| ------ | ----- |
| a      | 1     |

![A remote image](https://example.com/badge.svg)
`;

async function scan(page: Page, skip: string[] = []) {
  const builder = new AxeBuilder({ page }).withTags(STANDARD);
  return (skip.length ? builder.disableRules(skip) : builder).analyze();
}

async function expectClean(page: Page, skip: string[] = []) {
  const { violations } = await scan(page, skip);

  // Named down to the element in the failure message rather than just counted:
  // a bare "expected 0, got 3" sends you to the HTML report to find out what
  // broke, which is the difference between fixing it now and muting the test.
  expect(describe(violations), 'axe violations').toEqual([]);
}

function describe(violations: { id: string; nodes: { target: unknown[] }[] }[]): string[] {
  return violations.flatMap((violation) =>
    violation.nodes.map((node) => `${violation.id} @ ${node.target.join(' ')}`),
  );
}

async function openDocument(page: Page) {
  await page.getByRole('button', { name: 'Paste' }).click();
  await page.getByLabel('Markdown to read').fill(DOCUMENT);
  await page.getByRole('button', { name: 'Read it' }).click();
  await expect(page.getByRole('article')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('the landing page is clean', async ({ page }) => {
  await expectClean(page);
});

/**
 * Scans a surface in both themes.
 *
 * The default scheme is light, so a test that scans once proves half the app.
 * Every contrast bug this file has missed has been of one shape: a colour that
 * is fine against one theme's background and not the other's, on a surface no
 * test happened to render in the theme where it fails. Scanning both is what
 * turns that from a thing somebody notices into a thing the suite says.
 */
async function expectCleanInBothThemes(page: Page, skip: string[] = []) {
  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((value) => {
      document.documentElement.setAttribute('data-theme', value);
    }, theme);

    const { violations } = await scan(page, skip);
    expect(describe(violations), `axe violations in ${theme}`).toEqual([]);
  }
}

/**
 * Writes a row straight into IndexedDB, then reloads so the app picks it up.
 *
 * Reaching these states through the UI is slow and, for recents, impossible:
 * a real entry needs a File System Access handle, which only Chromium has and
 * which no test can mint. What is being scanned here is markup and colour, and
 * both components read their rows without ever touching a handle — so a plain
 * object stands in perfectly well. The behaviour behind these stores is proved
 * against the real thing in recovery.spec.ts and navigate.spec.ts.
 */
async function seed(page: Page, store: 'drafts' | 'recents', row: Record<string, unknown>) {
  await page.evaluate(
    ({ store: name, row: value }) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('localmd');
        request.onerror = () => reject(new Error('no storage'));
        request.onsuccess = () => {
          const transaction = request.result.transaction(name, 'readwrite');
          transaction.objectStore(name).put(value);
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(new Error('write failed'));
        };
      }),
    { store, row },
  );

  await page.reload();
}

test('the draft recovery panel is clean', async ({ page }) => {
  await seed(page, 'drafts', {
    id: 'seeded',
    name: 'notes.md',
    text: '# Notes\n',
    shape: { hadBom: false, lineEnding: 'lf', hadTrailingNewline: true },
    savedAt: Date.now() - 60_000,
    handle: null,
    baseModified: null,
  });

  await expect(page.getByRole('region', { name: 'Unsaved work' })).toBeVisible();

  // Small text on --bg-surface rather than on --bg. The two backgrounds differ
  // by less than the eye reads as a change and by more than the contrast budget
  // tolerates, which is the whole reason this is scanned rather than eyeballed.
  await expectCleanInBothThemes(page);
});

test('a hovered recent document is clean', async ({ page }) => {
  await seed(page, 'recents', {
    id: 'seeded',
    name: 'notes.md',
    size: 2048,
    lastOpened: Date.now() - 60_000,
    handle: { kind: 'file', name: 'notes.md' },
  });

  // Anchored, or this also matches the row's "Remove notes.md from recent
  // documents" button, which is a different element with a different background.
  const row = page.getByRole('button', { name: /^notes\.md/ });
  await expect(row).toBeVisible();
  await row.hover();

  // Hovered, because hovering is what changes the answer: the row paints itself
  // --bg-surface and the timestamp inside it does not change colour. A scan of
  // the resting state says nothing about the state the reader is in whenever
  // they are about to click.
  await expectCleanInBothThemes(page);
});

test('the privacy page is clean', async ({ page }) => {
  await page.getByRole('button', { name: 'Privacy' }).click();
  await expect(page.getByRole('heading', { name: 'Privacy', level: 1 })).toBeVisible();

  await expectClean(page);
});

test('a rendered document is clean', async ({ page }) => {
  await openDocument(page);
  await expectClean(page);
});

test('the blocked-content notice is clean', async ({ page }) => {
  await openDocument(page);
  // The notice only exists when something was withheld, which is the state a
  // first-time reader most often lands in.
  await expect(page.getByRole('status')).toBeVisible();

  await expectClean(page);
});

test('the outline is clean', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await openDocument(page);
  await expect(page.getByRole('navigation', { name: 'Outline' })).toBeVisible();

  await expectClean(page);
});

test('the command palette is clean', async ({ page, browserName }) => {
  await openDocument(page);
  await page.keyboard.press(browserName === 'webkit' ? 'Meta+k' : 'Control+k');
  await expect(page.getByRole('dialog')).toBeVisible();

  // Typed, so the selected option is a *command* rather than the heading that
  // happens to sort first. A command carries a shortcut hint, and that hint is
  // the only text in the app that lands on --accent-soft — a background nothing
  // scanned until this line existed.
  await page.keyboard.type('save');
  await expect(page.locator('.lmd-palette-option[aria-selected="true"] .lmd-palette-hint')).toBeVisible();

  // The palette is the surface most likely to break: a combobox driving a
  // grouped listbox through aria-activedescendant is easy to get subtly wrong.
  //
  // `scrollable-region-focusable` is suppressed, and only here. It asks whether
  // a scrolling box can be reached by keyboard, and answers by looking for a
  // focusable element inside it — which the options deliberately are not: focus
  // stays in the input and the selection moves virtually, which is the whole
  // combobox pattern. The content is genuinely keyboard-reachable (arrow keys
  // move the selection and scroll it into view), and that is asserted directly
  // in navigate.spec.ts rather than assumed here. Suppressed with a reason
  // beats adding a tabindex that satisfies the check without helping anyone.
  await expectCleanInBothThemes(page, ['scrollable-region-focusable']);
});

test('the editor is clean', async ({ page }) => {
  await openDocument(page);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.locator('.cm-content')).toBeVisible();

  // CodeMirror's contenteditable surface is the kind of thing that regresses
  // quietly: it must keep a name and a role, and the syntax colours have to
  // meet contrast like any other text.
  await expectClean(page);
});

test('the split layout is clean', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await openDocument(page);
  await page.getByRole('button', { name: 'Split', exact: true }).click();
  await expect(page.locator('.lmd-split')).toBeVisible();

  // No suppression here, unlike the palette: both panes contain genuinely
  // focusable content — the editor's contenteditable and the preview's links —
  // so the rule is satisfied honestly rather than waived.
  await expectClean(page);
});

test('both themes meet contrast', async ({ page }) => {
  await openDocument(page);
  await expectCleanInBothThemes(page);
});
