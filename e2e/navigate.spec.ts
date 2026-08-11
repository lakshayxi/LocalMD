import { expect, test, type Page } from '@playwright/test';

/**
 * Navigation: the ⌘K palette, the outline, deep links, and the keyboard map.
 *
 * These are the M3 features that only a real browser can prove. The palette's
 * behaviour is almost entirely keyboard and focus, the outline depends on
 * layout and scroll position, and the paste shortcut depends on a real
 * clipboard event — none of which survive a simulated DOM honestly.
 */

const DOCUMENT = `# Deployment Guide

Introduction.

## Prerequisites

Text.

### Tokens

Text.

## Configuration

Text.

#### Buried

A fourth-level heading, deeper than the outline shows.

## Troubleshooting

${'Filler paragraph to make the document long enough to scroll.\n\n'.repeat(40)}
`;

async function openDocument(page: Page) {
  await page.getByRole('button', { name: 'Paste' }).click();
  await page.getByLabel('Markdown to read').fill(DOCUMENT);
  await page.getByRole('button', { name: 'Read it' }).click();
  await expect(page.getByRole('article')).toBeVisible();
}

/** ⌘ on WebKit's macOS build, Ctrl everywhere else in the matrix. */
function modifier(browserName: string) {
  return browserName === 'webkit' ? 'Meta' : 'Control';
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  // Wait for React to mount before any test presses a key. The shortcut
  // listeners are attached on mount, so a keystroke sent between load and
  // hydration lands on nothing — and produces a confusing "combobox never
  // appeared" failure rather than an obvious race.
  await expect(page.getByRole('button', { name: 'Open Markdown' })).toBeVisible();
});

test.describe('command palette', () => {
  test('opens on the shortcut and takes focus', async ({ page, browserName }) => {
    await page.keyboard.press(`${modifier(browserName)}+k`);

    const palette = page.getByRole('dialog', { name: 'Command palette' });
    await expect(palette).toBeVisible();
    await expect(page.getByRole('combobox')).toBeFocused();
  });

  test('closes on Escape and returns focus where it was', async ({ page, browserName }) => {
    // Focus something real first: the failure this catches is the palette
    // dropping focus onto <body>, which makes the next Tab restart from the top
    // of the page.
    const paste = page.getByRole('button', { name: 'Paste' });
    await paste.focus();

    await page.keyboard.press(`${modifier(browserName)}+k`);
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(paste).toBeFocused();
  });

  test('lists the open document’s headings first', async ({ page, browserName }) => {
    await openDocument(page);
    await page.keyboard.press(`${modifier(browserName)}+k`);

    // With a document open, ⌘K is almost always "jump to a section".
    const groups = page.getByRole('group');
    await expect(groups.first()).toHaveAccessibleName('Go to');

    await expect(page.getByRole('option', { name: 'Prerequisites' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Tokens' })).toBeVisible();
  });

  test('filters as you type and keeps the selection valid', async ({ page, browserName }) => {
    await openDocument(page);
    await page.keyboard.press(`${modifier(browserName)}+k`);
    await page.getByRole('combobox').fill('config');

    const options = page.getByRole('option');
    await expect(options).toHaveCount(1);
    // A filtered list whose selection stayed put would leave the highlight on
    // whatever now occupies that row.
    await expect(options.first()).toHaveAttribute('aria-selected', 'true');
  });

  test('tracks the highlighted option in aria-activedescendant', async ({ page, browserName }) => {
    await openDocument(page);
    await page.keyboard.press(`${modifier(browserName)}+k`);
    await page.keyboard.press('ArrowDown');

    // Focus never leaves the input, so this attribute is the only thing telling
    // a screen reader what Enter would do.
    const selected = page.locator('[role="option"][aria-selected="true"]');
    const id = await selected.getAttribute('id');
    await expect(page.getByRole('combobox')).toHaveAttribute('aria-activedescendant', id!);
  });

  test('runs the highlighted option on Enter', async ({ page, browserName }) => {
    await page.keyboard.press(`${modifier(browserName)}+k`);
    await page.getByRole('combobox').fill('Theme: Dark');
    await page.keyboard.press('Enter');

    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('says so when nothing matches', async ({ page, browserName }) => {
    await page.keyboard.press(`${modifier(browserName)}+k`);
    await page.getByRole('combobox').fill('zzzznotacommand');

    await expect(page.getByRole('option')).toHaveCount(0);
    await expect(page.getByText(/Nothing matches/)).toBeVisible();
  });

  test('jumps to a heading', async ({ page, browserName }) => {
    await openDocument(page);
    await page.keyboard.press(`${modifier(browserName)}+k`);
    await page.getByRole('combobox').fill('Troubleshooting');
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(/#troubleshooting$/);
    await expect(page.getByRole('heading', { name: 'Troubleshooting' })).toBeInViewport();
  });
});

test.describe('outline', () => {
  // The outline only exists in margin the document was never going to use.
  test.use({ viewport: { width: 1600, height: 900 } });

  test('lists headings to three levels and no deeper', async ({ page }) => {
    await openDocument(page);

    const outline = page.getByRole('navigation', { name: 'Outline' });
    await expect(outline).toBeVisible();
    await expect(outline.getByRole('link', { name: 'Prerequisites' })).toBeVisible();
    await expect(outline.getByRole('link', { name: 'Tokens' })).toBeVisible();
    // Deeper than three levels is a table of contents, not an outline.
    await expect(outline.getByRole('link', { name: 'Buried' })).toHaveCount(0);
  });

  test('marks the heading the reader is under', async ({ page }) => {
    await openDocument(page);
    const outline = page.getByRole('navigation', { name: 'Outline' });

    await expect(outline.getByRole('link', { name: 'Deployment Guide' })).toHaveAttribute(
      'aria-current',
      'location',
    );

    await outline.getByRole('link', { name: 'Troubleshooting' }).click();
    await expect(outline.getByRole('link', { name: 'Troubleshooting' })).toHaveAttribute(
      'aria-current',
      'location',
    );
  });

  test('can be hidden, and the choice survives a reload', async ({ page }) => {
    await openDocument(page);
    const outline = page.getByRole('navigation', { name: 'Outline' });

    await outline.getByRole('button', { name: 'Hide' }).click();
    await expect(outline).toBeHidden();

    await page.reload();
    await openDocument(page);
    await expect(page.getByRole('navigation', { name: 'Outline' })).toBeHidden();
  });

  test('stays out of the way on a narrow screen', async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 900 });
    await openDocument(page);

    // Below ~1400px there is no spare margin, and the palette is the way to
    // navigate.
    await expect(page.getByRole('navigation', { name: 'Outline' })).toBeHidden();
  });
});

test.describe('deep links', () => {
  test('heading anchors are addressable', async ({ page }) => {
    await openDocument(page);

    await page.getByRole('link', { name: 'Configuration' }).first().click();
    await expect(page).toHaveURL(/#configuration$/);
    await expect(page.getByRole('heading', { name: 'Configuration' })).toBeInViewport();
  });

  test('the privacy route does not collide with a heading slug', async ({ page }) => {
    // Routes are prefixed `#/` precisely so a document with a "## Privacy"
    // heading cannot navigate away from the document.
    await page.getByRole('button', { name: 'Privacy' }).click();
    await expect(page).toHaveURL(/#\/privacy$/);
    await expect(page.getByRole('heading', { name: 'Privacy', level: 1 })).toBeVisible();
  });
});

test.describe('keyboard map', () => {
  /**
   * Whether this browser can synthesize a paste carrying data.
   *
   * Firefox ignores `clipboardData` passed to the `ClipboardEvent`
   * constructor, so the event arrives empty and nothing can be proved either
   * way. Checked as a capability rather than by browser name: the skip
   * disappears on its own if Firefox implements it.
   *
   * It matters for the negative test too — an inert event would satisfy
   * "nothing happened" without exercising a single line of the handler, which
   * is a passing test that checks nothing.
   *
   * The handler reads the same `clipboardData` a real paste populates, so this
   * is a limit of the harness, not a gap in Firefox support. Manual ⌘V on
   * Firefox is on the release checklist beside the save-in-place check.
   */
  async function canSynthesizePaste(page: Page) {
    return page.evaluate(() => {
      const transfer = new DataTransfer();
      transfer.setData('text/plain', 'probe');
      const event = new ClipboardEvent('paste', { clipboardData: transfer });
      return event.clipboardData?.getData('text/plain') === 'probe';
    });
  }

  async function paste(page: Page, text: string, intoActiveElement = false) {
    await page.evaluate(
      ({ text: value, intoActiveElement: targeted }) => {
        const transfer = new DataTransfer();
        transfer.setData('text/plain', value);
        const target = targeted ? (document.activeElement ?? document.body) : document.body;
        target.dispatchEvent(
          new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }),
        );
      },
      { text, intoActiveElement },
    );
  }

  test('pasting anywhere opens the pasted Markdown', async ({ page }) => {
    test.skip(!(await canSynthesizePaste(page)), 'cannot synthesize a paste with data');

    // The shortest path from landing to reading: land, ⌘V, read. Driven by a
    // paste event rather than the Clipboard API, which is what the handler
    // consumes — LocalMD never asks for standing clipboard access.
    await paste(page, '# Pasted heading\n\nSome text.');

    await expect(page.getByRole('heading', { name: 'Pasted heading' })).toBeVisible();
  });

  test('pasting into a text field is left alone', async ({ page }) => {
    test.skip(!(await canSynthesizePaste(page)), 'cannot synthesize a paste with data');

    await page.getByRole('button', { name: 'Paste' }).click();
    const field = page.getByLabel('Markdown to read');
    await field.focus();

    await paste(page, '# Should stay in the box', true);

    // Still on the landing page, still composing.
    await expect(field).toBeVisible();
    await expect(page.getByRole('article')).toHaveCount(0);
  });
});

test.describe('recents', () => {
  test('shows nothing where there is nothing reopenable', async ({ page }) => {
    // Only handle-backed documents are recorded, so a pasted one leaves no
    // trace — and an empty "Recent" heading would announce a feature that
    // Safari and Firefox readers cannot have at all.
    await openDocument(page);
    await page.getByRole('button', { name: 'Close document' }).click();

    await expect(page.getByRole('navigation', { name: 'Recent' })).toHaveCount(0);
  });
});
