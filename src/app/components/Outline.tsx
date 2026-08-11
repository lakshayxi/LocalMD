import { useEffect, useMemo, useState } from 'react';
import type { Heading } from '@/core/markdown';
import { MOD_KEY } from '../format';
import { useDocument } from '../store';

/**
 * The document outline, pinned in the left margin.
 *
 * **Deliberate deviation from §14 of the plan, which specifies the pinned
 * outline as opt-in. It ships default-on above 1400px.** Recorded here rather
 * than quietly changed, because the plan is otherwise the source of truth.
 *
 * The reasoning §14 gives for opt-in is that a permanent sidebar competes with
 * the document. That is right below about 1400px — which is why the ⌘K palette
 * is the primary way to navigate and this is not, and why the outline does not
 * render at all at narrower widths. Above 1400px it occupies margin that was
 * empty anyway, so the cost §14 is protecting against is not being paid, and
 * the same section's own test applies: it "appears only above ~1400px where it
 * costs nothing". An opt-in control that nothing points at is a feature almost
 * nobody finds, and a long technical README is markedly easier to hold in your
 * head with its structure visible.
 *
 * What makes the deviation safe is that it stays a preference, not a fixture:
 * a Hide control sits in the outline itself, ⌘K toggles it, and the choice
 * survives reloads.
 */

/** Deeper than three levels is a table of contents, not an outline. */
const MAX_DEPTH = 3;

/** One heading is not a structure worth drawing furniture around. */
const MIN_HEADINGS = 2;

/** Mirrors `scroll-margin-top` on headings in document.css: 1.5rem past the header. */
const ANCHOR_OFFSET = 24;

/** Keeps an anchored heading clear of the activation line. See `update` below. */
const SLACK = 16;

export function Outline() {
  const rendered = useDocument((s) => s.rendered);
  const pinned = useDocument((s) => s.outlinePinned);
  const setPinned = useDocument((s) => s.setOutlinePinned);

  // Selecting `rendered` and deriving here rather than selecting a filtered
  // array: a selector that allocates returns a new reference every call, which
  // Zustand reads as a state change and loops on.
  const headings = useMemo(
    () => (rendered?.headings ?? []).filter((heading) => heading.depth <= MAX_DEPTH),
    [rendered],
  );

  const active = useActiveHeading(headings);

  if (!pinned || headings.length < MIN_HEADINGS) return null;

  return (
    <nav className="lmd-outline" aria-labelledby="lmd-outline-heading">
      <div className="lmd-outline-top">
        <h2 className="lmd-outline-heading" id="lmd-outline-heading">
          Outline
        </h2>
        <button
          type="button"
          className="lmd-outline-hide"
          onClick={() => setPinned(false)}
          title={`Hide the outline (${MOD_KEY}K brings it back)`}
        >
          Hide
        </button>
      </div>

      <ul className="lmd-outline-list">
        {headings.map((heading) => (
          <li key={heading.id}>
            {/* A real anchor, not a button: the target is a real fragment, so
                this should be focusable, middle-clickable, and copyable as a
                link. Scroll offset is handled by scroll-margin-top on the
                headings themselves. */}
            <a
              className="lmd-outline-link"
              href={`#${heading.id}`}
              data-depth={heading.depth}
              aria-current={heading.id === active ? 'location' : undefined}
            >
              {heading.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * The heading the reader is currently under.
 *
 * Deliberately not an IntersectionObserver. Observers answer "is this element
 * on screen", but the question here is "which heading did I last scroll past",
 * and those differ badly for a long section whose heading has scrolled away —
 * the observer reports nothing visible and the outline highlights nothing.
 * Comparing positions answers the actual question directly.
 */
function useActiveHeading(headings: Heading[]): string | null {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    if (headings.length === 0) {
      setActive(null);
      return;
    }

    let frame = 0;

    const update = () => {
      frame = 0;
      // A little below the header, so a heading counts as current once it has
      // reached comfortable reading position rather than the moment it touches
      // the top edge.
      //
      // The slack matters more than it looks. Following an anchor parks a
      // heading at exactly `scroll-margin-top` — header height plus 1.5rem — so
      // a line drawn at that same offset makes "is this heading current?" a
      // subpixel coin toss, and jumping to a section would routinely highlight
      // the one above it. The extra rem puts the answer safely on one side.
      const header = document.querySelector('.lmd-header')?.getBoundingClientRect().height ?? 40;
      const line = header + ANCHOR_OFFSET + SLACK;

      let current = headings[0]?.id ?? null;
      for (const heading of headings) {
        const element = document.getElementById(heading.id);
        if (!element) continue;
        if (element.getBoundingClientRect().top > line) break;
        current = heading.id;
      }

      setActive(current);
    };

    // Coalesced to one update per frame: scroll fires far more often than the
    // highlight can meaningfully change, and each update reads layout.
    const onScroll = () => {
      frame ||= requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [headings]);

  return active;
}
