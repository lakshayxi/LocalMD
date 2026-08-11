/**
 * Neutralises network and execution primitives in generated SVG stylesheets.
 *
 * Mermaid emits its diagram styling as a `<style>` element inside the SVG, so
 * that element has to survive sanitization or every node renders as a solid
 * black shape. Allowing it back reopens a gap that the rest of the pipeline
 * closes: CSS is a network primitive. A single `url()` would fetch from a third
 * party while the document renders, which is precisely the leak the image gate
 * exists to prevent, and CSP cannot stop it — `img-src` has to permit https:
 * for the remote-content opt-in to work at all.
 *
 * Nothing Mermaid legitimately produces contains any of these; its stylesheet
 * is colours, strokes, and font families built from theme variables we supply.
 * So the safe reading of a match is "something has gone wrong", and the right
 * response is to break the construct rather than to allow it.
 *
 * Lives in `core` because it is pure string logic and needs to be testable
 * without a DOM.
 */

const ESCAPE_HATCHES = /url\s*\(|@import|expression\s*\(|javascript:|behavior\s*:/gi;

/** Replacement is deliberately invalid CSS so a match cannot resolve. */
const NEUTRALISED = 'blocked-by-localmd(';

export function scrubSvgCss(svg: string): string {
  return svg.replace(ESCAPE_HATCHES, NEUTRALISED);
}

/** True if the SVG contains anything the scrub would have to neutralise. */
export function hasCssEscapeHatch(svg: string): boolean {
  ESCAPE_HATCHES.lastIndex = 0;
  return ESCAPE_HATCHES.test(svg);
}
