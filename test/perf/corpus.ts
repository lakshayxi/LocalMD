/**
 * The performance corpus.
 *
 * §16 asks for a committed corpus so that the budgets are measured against the
 * same documents every time — a number measured today has to be comparable to
 * one measured next year, and a corpus that drifts turns a regression into an
 * argument about the fixture.
 *
 * **Built rather than checked in as a 1MB blob.** The documents are generated
 * from these templates by a deterministic function with no randomness, so every
 * machine builds byte-identical text, and the thing under review is thirty lines
 * of template instead of a megabyte of filler nobody will ever read. The one
 * real document in the corpus — a 45KB plan — stays a real file, because the
 * budget that matters most is the one for an ordinary README and synthetic prose
 * would not have its shape.
 *
 * Sizes come from the budget table in §16 rather than from the sentence next to
 * it: what gets asserted is 50KB, 250KB and 1MB, so those are what exist here.
 */

/** Block templates. Cheap on purpose — the cost under test is the pipeline's. */

function paragraph(n: number): string {
  return [
    `### Section ${n}`,
    '',
    `Prose about subject ${n}, with a [link](https://example.com/${n}), some ` +
      '`inline code`, **bold** and *emphasis*. A second sentence gives the ' +
      'paragraph enough length to wrap the way a real one does.',
    '',
    `- first point about ${n}`,
    `- second point, with \`code\``,
    `- third point`,
    '',
  ].join('\n');
}

function table(n: number): string {
  return [
    `| Option ${n} | Default | Meaning |`,
    '| --- | --- | --- |',
    '| `alpha` | `true` | Enables the first thing |',
    '| `beta` | `false` | Enables the second thing |',
    '| `gamma` | `"auto"` | Chooses between them |',
    '',
  ].join('\n');
}

/** Rotated, because Shiki loads one grammar chunk per language. */
const LANGUAGES = ['ts', 'python', 'bash', 'json', 'rust', 'sql'];

function codeBlock(n: number): string {
  const language = LANGUAGES[n % LANGUAGES.length];
  return [
    '```' + language,
    `// block ${n}`,
    'export function example(input: string): number {',
    '  const parsed = Number.parseInt(input, 10);',
    '  return Number.isNaN(parsed) ? 0 : parsed * 2;',
    '}',
    '```',
    '',
  ].join('\n');
}

function diagram(n: number): string {
  return [
    '```mermaid',
    'graph TD',
    `  A${n}[Start ${n}] --> B${n}{Decide}`,
    `  B${n} -->|yes| C${n}[Do the thing]`,
    `  B${n} -->|no| D${n}[Stop]`,
    '```',
    '',
  ].join('\n');
}

function math(n: number): string {
  return [
    `$$\\sum_{i=1}^{${n + 1}} \\frac{x_i^2 + \\alpha}{\\sqrt{2\\pi\\sigma^2}} = \\beta_{${n}}$$`,
    '',
  ].join('\n');
}

export interface DocumentShape {
  /** Target size. The result lands within a block of it, never under. */
  kilobytes: number;
  codeBlocks: number;
  diagrams: number;
  formulas: number;
}

/**
 * Builds one document, spreading the expensive blocks evenly through it.
 *
 * Evenly matters: bunching every code block at the top would make the first
 * screen unrepresentative, and the lazy rendering that arrives in M5 is judged
 * precisely on what is near the viewport at open.
 */
export function buildDocument(shape: DocumentShape): string {
  const target = shape.kilobytes * 1024;

  // Interleaved by construction rather than shuffled, so there is no random
  // seed to keep: code, diagram, formula, code, diagram, formula, and whichever
  // kind still has blocks left once the others run out.
  const expensive: string[] = [];
  for (let i = 0; i < Math.max(shape.codeBlocks, shape.diagrams, shape.formulas); i += 1) {
    if (i < shape.codeBlocks) expensive.push(codeBlock(i));
    if (i < shape.diagrams) expensive.push(diagram(i));
    if (i < shape.formulas) expensive.push(math(i));
  }

  const parts = ['# Performance corpus document', ''];
  let size = parts.join('\n').length;
  let placed = 0;
  let n = 0;

  while (size < target) {
    while (placed < expensive.length && size >= (target * (placed + 0.5)) / expensive.length) {
      const block = expensive[placed] as string;
      parts.push(block);
      size += block.length;
      placed += 1;
    }

    const block = n % 4 === 3 ? table(n) : paragraph(n);
    parts.push(block);
    size += block.length;
    n += 1;
  }

  // Anything whose slot never came, because prose overshot the last threshold.
  for (const block of expensive.slice(placed)) parts.push(block);

  return parts.join('\n');
}

/**
 * The corpus, as the budgets in §16 name it.
 *
 * The 1MB document's counts are the plan's: ~200 code blocks, ~30 Mermaid
 * diagrams, heavy math. The smaller two carry the same *density* rather than
 * the same counts, so that a 250KB document is a quarter of the work and not a
 * quarter of the prose with all the diagrams still in it.
 */
export const CORPUS = {
  medium: () => buildDocument({ kilobytes: 250, codeBlocks: 50, diagrams: 8, formulas: 25 }),
  torture: () => buildDocument({ kilobytes: 1024, codeBlocks: 200, diagrams: 30, formulas: 100 }),
};

/** The real 45KB document standing in for "a 50KB README". See the note above. */
export const REAL_DOCUMENT = 'test/fixtures/markdown/long-document.md';
