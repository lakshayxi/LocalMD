import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { CORPUS, REAL_DOCUMENT } from '../test/perf/corpus';

/**
 * §16's budgets, measured against the production build.
 *
 * Everything here is a *render* measurement: the clock starts when the document
 * is handed to the app and stops when its text is on screen. Download and boot
 * are somebody else's budget — the initial payload is asserted by
 * scripts/assert-bundle-budget.mjs, which is the only thing that can see the
 * built chunks.
 *
 * **Warm, deliberately.** Each measurement opens a throwaway document first, so
 * the Markdown pipeline, Shiki and KaTeX chunks are already fetched. A cold
 * number here would mostly measure the preview server on whatever machine CI
 * gave us, and would move whenever a chunk boundary moved — a budget that
 * fails for reasons unrelated to rendering is a budget that gets muted.
 *
 * **Chromium only, and its own project.** These numbers are not comparable
 * across engines, three sets of them would be three sets of flakes, and the
 * thing being protected — the pipeline and the React commit — is the same code
 * everywhere. See playwright.config.ts.
 *
 * **Two numbers, because they answer different questions.** Every run prints
 * the measurement against §16's target and says plainly whether it is met. What
 * gets *asserted* by default is a much looser ceiling, sized to catch a
 * five-fold regression on a shared CI runner rather than a twenty-percent one on
 * a fast laptop. Running with `PERF_STRICT=1` asserts §16 itself, which is the
 * form the release gate is signed off in, on a machine somebody chose.
 *
 * That split is not a way of quietly passing. Every §16 row is met on the
 * machine the gate is signed off on, and the strict run is what proves it; the
 * ceiling exists so that a busy runner cannot turn a met budget into a red
 * build. If a strict run ever fails, that is the finding — §16 does not move to
 * meet the code.
 *
 * **Long tasks are watched past first paint.** The slices still mounting, the
 * diagrams hydrating and the code blocks upgrading all happen afterwards, and a
 * measurement that stopped at the first frame would report a clean main thread
 * while the reader's scrolling stuttered.
 */

/**
 * The document handed to the app before every measurement.
 *
 * Small, but it has to contain one of everything the corpus contains — a fence
 * *and* a formula — or the first corpus document that uses one pays to download
 * that chunk inside the measured window. That is how a 250KB render read 739ms
 * one run and 460ms the next: KaTeX arriving mid-measurement.
 */
const WARMUP = [
  '# Warm up',
  '',
  'Text, `code`, a fence and a formula.',
  '',
  '```ts',
  'const x = 1;',
  '```',
  '',
  '$$x^2$$',
  '',
].join('\n');

interface Measurement {
  renderMs: number;
  longestTaskMs: number | null;
  heapMB: number | null;
}

/**
 * How long to keep watching for long tasks after the document is on screen.
 *
 * First paint is not where the main thread is most at risk: the slices still
 * mounting, the diagrams hydrating and the code blocks upgrading all land
 * *after* it. A measurement that stopped at first paint would report a clean
 * main thread and miss every one of them.
 */
const SETTLE_MS = 3000;

/**
 * Opens a document by drop and times it to the pixel.
 *
 * Two nested `requestAnimationFrame`s rather than a mutation callback: the
 * budget is about what the reader sees, so the clock has to run past the commit
 * into the frame that paints it. This only works in a page the browser is
 * actually drawing — a hidden or backgrounded page never gets a frame and
 * throttles its timers to about a second, which is why this lives in Playwright
 * and not in a devtools console.
 */
async function measure(page: Page, text: string, settle = 0): Promise<Measurement> {
  return page.evaluate(async ({ contents, settle }) => {
    // Longest main-thread task during the render. `longtask` is Chromium-only,
    // and its absence is reported as null rather than as a zero.
    let longestTaskMs: number | null = null;
    let observer: PerformanceObserver | undefined;
    try {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          longestTaskMs = Math.max(longestTaskMs ?? 0, entry.duration);
        }
      });
      observer.observe({ entryTypes: ['longtask'] });
    } catch {
      observer = undefined;
    }

    const start = performance.now();

    const transfer = new DataTransfer();
    transfer.items.add(new File([contents], 'perf.md', { type: 'text/markdown' }));
    document
      .querySelector('.lmd-drop-root')
      ?.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true }));

    await new Promise<void>((resolve) => {
      const tick = () => {
        const article = document.querySelector('article.lmd-document');
        // A fifth of the source length is comfortably past "the first block
        // arrived" and comfortably under the rendered length of any document
        // in the corpus, so this cannot resolve on a partial tree.
        if (article && article.textContent && article.textContent.length > contents.length / 5) {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        } else {
          requestAnimationFrame(tick);
        }
      };
      tick();
    });

    const renderMs = performance.now() - start;

    // Keep listening while the rest of the document mounts, the diagrams
    // hydrate and the code upgrades itself. Those are the tasks most likely to
    // be long, and they all happen after the reader can see something.
    await new Promise((resolve) => setTimeout(resolve, settle));
    observer?.disconnect();

    const memory = (performance as { memory?: { usedJSHeapSize: number } }).memory;

    return {
      renderMs,
      longestTaskMs,
      heapMB: memory ? memory.usedJSHeapSize / 1024 / 1024 : null,
    };
  }, { contents: text, settle });
}

/** Loads the app, then warms every lazily-imported chunk the corpus will need. */
async function warmed(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Open Markdown' })).toBeVisible();

  await measure(page, WARMUP);
  await page.getByRole('button', { name: 'Close document' }).click();
  await expect(page.getByRole('button', { name: 'Open Markdown' })).toBeVisible();
}

/**
 * Whether §16 itself is being asserted, or only the regression ceiling.
 *
 * The gate is signed off with `PERF_STRICT=1` on a machine somebody chose. CI
 * runs without it, because a budget that goes red when a shared runner is busy
 * is a budget that gets muted within a month, and a muted budget protects
 * nothing at all.
 */
const STRICT = process.env.PERF_STRICT === '1';

/** Prints the measurement against §16 and says whether it is met. Always. */
function report(label: string, target: number, measurement: Measurement): void {
  const rendered = Math.round(measurement.renderMs);
  const verdict = measurement.renderMs < target ? 'meets' : 'MISSES';

  const parts = [`${label}: ${rendered}ms render (${verdict} §16 target of ${target}ms)`];
  // A `longtask` entry exists only for tasks over 50ms, so "none" is the
  // §16 result rather than a missing reading. Said in words, because a silent
  // line and a clean one look identical otherwise.
  parts.push(
    measurement.longestTaskMs === null
      ? 'no task over 50ms'
      : `${Math.round(measurement.longestTaskMs)}ms longest task`,
  );
  if (measurement.heapMB !== null) parts.push(`${Math.round(measurement.heapMB)}MB heap`);
  console.log(parts.join(', '));
}

/**
 * §16's target, and the ceiling asserted when not running strictly.
 *
 * The ceilings are roughly three times what this renders in today, which is
 * where a slow shared runner sits and where a genuine collapse — a lost lazy
 * import, a memoization that stopped memoizing, a render per keystroke — would
 * land well outside. They are not a second opinion about what good looks like.
 */
const BUDGETS = {
  readme: { target: 150, ceiling: 900 },
  medium: { target: 600, ceiling: 2000 },
  torture: { target: 2500, ceiling: 8000 },
};

function limit(budget: { target: number; ceiling: number }): number {
  return STRICT ? budget.target : budget.ceiling;
}

test.describe('§16 render budgets', () => {
  test('a 45KB README renders within the first-paint budget', async ({ page }) => {
    const document = await readFile(REAL_DOCUMENT, 'utf8');
    await warmed(page);

    const measurement = await measure(page, document, SETTLE_MS);
    report('45KB real document', BUDGETS.readme.target, measurement);

    expect(measurement.renderMs).toBeLessThan(limit(BUDGETS.readme));
  });

  test('a 250KB document renders within the full-render budget', async ({ page }) => {
    await warmed(page);

    const measurement = await measure(page, CORPUS.medium(), SETTLE_MS);
    report('250KB corpus document', BUDGETS.medium.target, measurement);

    expect(measurement.renderMs).toBeLessThan(limit(BUDGETS.medium));
  });

  test('a 1MB torture document renders without blocking the main thread', async ({ page }) => {
    test.slow();
    await warmed(page);

    const measurement = await measure(page, CORPUS.torture(), SETTLE_MS);
    report('1MB torture document', BUDGETS.torture.target, measurement);

    expect(measurement.renderMs).toBeLessThan(limit(BUDGETS.torture));

    // §16's other rule for this row, and the one that decided the
    // architecture: no task over 50ms. Asserted at every level rather than
    // only under PERF_STRICT, because it is not a stopwatch reading that a
    // loaded machine can push over the line — a task this long means work went
    // back onto the main thread, which is a structural regression whatever
    // hardware notices it. The ceiling is doubled off strict for the one thing
    // a loaded machine genuinely does inflate: the length of a task already
    // running when the scheduler is preempted.
    if (measurement.longestTaskMs !== null) {
      expect(measurement.longestTaskMs).toBeLessThan(STRICT ? 50 : 100);
    }

    // §16's 250MB. A number this far inside its budget is what says the
    // document is held cheaply as well as rendered cheaply.
    if (measurement.heapMB !== null) expect(measurement.heapMB).toBeLessThan(250);
  });
});
