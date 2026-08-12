import type { Root, RootContent } from 'hast';

/**
 * Cutting a document into pieces small enough to move and to mount.
 *
 * One function, used at both ends of the same journey, because both ends have
 * the same 50ms problem and the same natural seam:
 *
 *  - **Crossing the worker boundary.** A megabyte of Markdown is ~78,000 hast
 *    nodes, and posting that tree as one message cost 1.3 seconds of
 *    structured-clone *deserialization on the main thread* — a longer block
 *    than the parse the worker was moved off it to avoid. Sliced, each message
 *    deserializes in a few milliseconds.
 *  - **Committing to the DOM.** The same slices are what React mounts, one
 *    batch per task, instead of building 78,000 nodes in a single commit.
 *
 * Cuts only at top-level boundaries. Half a table or a partly built list would
 * be on screen for a frame, and a document that assembles itself in front of
 * the reader looks broken in a way one that grows downward does not.
 */

/**
 * Nodes per slice.
 *
 * Measured, not guessed: at this size a slice deserializes in single-digit
 * milliseconds and commits in about twenty, which leaves room under the 50ms
 * ceiling for a machine slower than the one it was tuned on without making the
 * slices so small that per-message and per-render overhead starts to dominate.
 */
export const SLICE_NODES = 2000;

export interface DocumentSlice {
  nodes: RootContent[];
  /** Stable across renders when this slice's sanitized content is unchanged. */
  hash: string;
}

/**
 * A compact, deterministic content hash for React reconciliation.
 *
 * Two independent 32-bit accumulators plus the serialized length make an
 * accidental collision impractical without paying the cost of Web Crypto for
 * every slice. The tree is already sanitized plain data, so JSON key order is
 * deterministic for the same pipeline output.
 */
export function hashSlice(nodes: RootContent[]): string {
  const serialized = JSON.stringify(nodes);
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;

  for (let index = 0; index < serialized.length; index += 1) {
    const code = serialized.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }

  return `${(first >>> 0).toString(36)}-${(second >>> 0).toString(36)}-${serialized.length}`;
}

/** Weighs a block by what it costs to move and to commit, which is nodes. */
function weigh(node: RootContent): number {
  if (node.type !== 'element') return 1;

  let total = 1;
  for (const child of node.children) total += weigh(child as RootContent);
  return total;
}

export function sliceTree(tree: Root, maxNodes: number = SLICE_NODES): RootContent[][] {
  const slices: RootContent[][] = [];
  let current: RootContent[] = [];
  let weight = 0;

  for (const node of tree.children) {
    current.push(node);
    weight += weigh(node);

    if (weight >= maxNodes) {
      slices.push(current);
      current = [];
      weight = 0;
    }
  }

  if (current.length > 0) slices.push(current);

  // Never zero slices: an empty document still has to replace whatever was on
  // screen before it, and a caller that receives nothing cannot tell the
  // difference between "empty" and "still loading".
  return slices.length > 0 ? slices : [[]];
}

export function sliceTreeWithHashes(tree: Root, maxNodes: number = SLICE_NODES): DocumentSlice[] {
  return sliceTree(tree, maxNodes).map((nodes) => ({ nodes, hash: hashSlice(nodes) }));
}
