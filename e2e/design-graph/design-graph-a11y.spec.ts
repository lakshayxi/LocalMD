import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

for (const fixture of [
  'controls',
  'sidebar-items',
  'typography',
  'toolbar-active',
  'palette-open',
  'document-find',
  'shell-empty',
  'shell-loading',
  'shell-error',
  'shell-read',
]) {
  test(`${fixture} fixture has no detectable accessibility violations`, async ({ page }) => {
    await page.goto(`/design-graph.html?fixture=${fixture}&theme=light&width=standard`);

    const results = await new AxeBuilder({ page }).include('[data-fixture]').analyze();
    expect(results.violations).toEqual([]);
  });
}
