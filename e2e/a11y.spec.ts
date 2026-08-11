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
 * Puts a draft in storage without going through an edit.
 *
 * Reaching this state through the UI costs an open, an edit, a wait for the idle
 * flush and a reload; seeding it directly is the same panel in a tenth of the
 * time. The behaviour behind it is proved in recovery.spec.ts — what is being
 * scanned here is the markup and the colours.
 */
async function seedDraft(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('localmd');
        request.onerror = () => reject(new Error('no storage'));
        request.onsuccess = () => {
          const transaction = request.result.transaction('drafts', 'readwrite');
          transaction.objectStore('drafts').put({
            id: 'seeded',
            name: 'notes.md',
            text: '# Notes\n',
            shape: { hadBom: false, lineEnding: 'lf', hadTrailingNewline: true },
            savedAt: Date.now() - 60_000,
            handle: null,
            baseModified: null,
          });
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(new Error('write failed'));
        };
      }),
  );

  await page.reload();
}

test('the draft recovery panel is clean', async ({ page }) => {
  await seedDraft(page);
  const recovery = page.getByRole('region', { name: 'Unsaved work' });
  await expect(recovery).toBeVisible();

  // The one surface in the app that puts small text on --bg-surface rather than
  // on --bg. The two backgrounds differ by less than the eye reads as a change
  // and by more than the contrast budget tolerates, so this is scanned in both
  // themes rather than trusted to look fine.
  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((value) => {
      document.documentElement.setAttribute('data-theme', value);
    }, theme);

    const { violations } = await scan(page);
    expect(describe(violations), `axe violations in ${theme}`).toEqual([]);
  }
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
  await expectClean(page, ['scrollable-region-focusable']);
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

  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((value) => {
      document.documentElement.setAttribute('data-theme', value);
    }, theme);

    const { violations } = await scan(page);
    expect(describe(violations), `axe violations in ${theme}`).toEqual([]);
  }
});
