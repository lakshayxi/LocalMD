import { describe, expect, it } from 'vitest';
import { buildDocument, CORPUS } from './corpus';

/**
 * The corpus, checked against what it claims to be.
 *
 * A budget is only worth what the fixture behind it is worth. A "250KB
 * document" that quietly became 180KB would make the budget look met, and a
 * torture document that lost its diagrams would make the hardest case the
 * easiest one — both failures are invisible from the perf run itself, which
 * would go green and say nothing.
 */

function count(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

describe('the perf corpus', () => {
  it('builds the sizes the budgets are named after', () => {
    const medium = CORPUS.medium().length / 1024;
    const torture = CORPUS.torture().length / 1024;

    // Never under target — a document that came up short would flatter the
    // budget — and within a block of it, since building stops at a block edge.
    expect(medium).toBeGreaterThanOrEqual(250);
    expect(medium).toBeLessThan(250 * 1.05);
    expect(torture).toBeGreaterThanOrEqual(1024);
    expect(torture).toBeLessThan(1024 * 1.05);
  });

  it('carries the expensive blocks the plan asks for', () => {
    const torture = CORPUS.torture();

    expect(count(torture, /```mermaid/g)).toBe(30);
    // Every fence, minus the Mermaid ones: what Shiki is asked to highlight.
    expect(count(torture, /^```[a-z]/gm) - 30).toBe(200);
    expect(count(torture, /\$\$/g) / 2).toBe(100);
  });

  it('is deterministic, so a number measured today is comparable to a later one', () => {
    expect(CORPUS.medium()).toBe(CORPUS.medium());
  });

  it('spreads the expensive blocks through the document', () => {
    const document = buildDocument({
      kilobytes: 100,
      codeBlocks: 20,
      diagrams: 4,
      formulas: 10,
    });

    // A corpus with every fence at the top would make the first screen — the
    // thing M5's lazy rendering is judged on — unrepresentative of the rest.
    const half = Math.floor(document.length / 2);
    const first = count(document.slice(0, half), /^```[a-z]/gm);
    const second = count(document.slice(half), /^```[a-z]/gm);

    expect(first).toBeGreaterThan(0);
    expect(second).toBeGreaterThan(0);
    expect(Math.abs(first - second)).toBeLessThanOrEqual(4);
  });
});
