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
