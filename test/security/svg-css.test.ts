import { describe, expect, it } from 'vitest';
import { hasCssEscapeHatch, scrubSvgCss } from '@/core/security/svg-css';

/**
 * Mermaid's stylesheet has to survive sanitization or diagrams render as solid
 * black shapes, which means an attacker-influenced document gets a `<style>`
 * element into the page. CSS can reach the network, so this is the control that
 * keeps the "contacts nobody" guarantee true for diagrams.
 */

describe('scrubSvgCss', () => {
  const leaks = [
    ['plain url()', '<style>.node{background:url(https://evil.example.com/x.png)}</style>'],
    ['url with spaces', '<style>.node{background: url ( "https://evil.example.com/x" )}</style>'],
    ['uppercase URL()', '<style>.node{background:URL(https://evil.example.com/x)}</style>'],
    ['@import', '<style>@import "https://evil.example.com/theme.css";</style>'],
    ['@IMPORT uppercase', '<style>@IMPORT url(https://evil.example.com/x);</style>'],
    ['legacy expression()', '<style>.node{width:expression(alert(1))}</style>'],
    ['javascript: in css', '<style>.node{background:javascript:alert(1)}</style>'],
    ['IE behavior', '<style>.node{behavior:url(#default#time2)}</style>'],
  ] as const;

  it.each(leaks)('neutralises %s', (_label, css) => {
    const scrubbed = scrubSvgCss(css);

    expect(scrubbed).not.toMatch(/url\s*\(/i);
    expect(scrubbed).not.toMatch(/@import/i);
    expect(scrubbed).not.toMatch(/expression\s*\(/i);
    expect(scrubbed).not.toMatch(/javascript:/i);
    expect(scrubbed).toContain('blocked-by-localmd');
  });

  it('leaves legitimate mermaid styling untouched', () => {
    // What Mermaid actually emits: colours, strokes, and font families built
    // from the theme variables we hand it.
    const css =
      '<style>#lmd-diagram-1 .node rect{fill:#f4f4f0;stroke:#d2d2ca;stroke-width:1px}' +
      '#lmd-diagram-1 .label{font-family:var(--font-prose);color:#1a1a18}</style>';

    expect(scrubSvgCss(css)).toBe(css);
  });

  it('does not corrupt diagram text that merely mentions a url', () => {
    const svg = '<svg><text>See https://example.com for details</text></svg>';

    expect(scrubSvgCss(svg)).toBe(svg);
  });
});

describe('hasCssEscapeHatch', () => {
  it('detects a leak', () => {
    expect(hasCssEscapeHatch('<style>a{background:url(https://x.example)}</style>')).toBe(true);
  });

  it('reports clean styling as clean', () => {
    expect(hasCssEscapeHatch('<style>a{fill:#fff}</style>')).toBe(false);
  });

  it('is not affected by regex lastIndex between calls', () => {
    // The pattern is global; without resetting lastIndex, repeated calls would
    // alternate between true and false on identical input.
    const css = '<style>a{background:url(https://x.example)}</style>';

    expect(hasCssEscapeHatch(css)).toBe(true);
    expect(hasCssEscapeHatch(css)).toBe(true);
    expect(hasCssEscapeHatch(css)).toBe(true);
  });
});
