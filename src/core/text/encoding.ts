/**
 * Byte-level fidelity for round-tripping a file.
 *
 * Opening a document and saving it without edits must produce a byte-identical
 * file. Getting this wrong produces whole-file diffs — every line marked
 * changed because CRLF was normalized to LF — which is the fastest way to lose
 * the trust of the git-using developer this product is aimed at.
 *
 * The editor and parser work exclusively in LF with no BOM. These functions are
 * the boundary: decode on the way in, restore on the way out.
 */

const BOM = '\ufeff';

export type LineEnding = 'lf' | 'crlf';

export interface TextShape {
  /** Whether the source began with a UTF-8 byte order mark. */
  hadBom: boolean;
  /** Dominant line ending in the source. */
  lineEnding: LineEnding;
  /**
   * Whether the source ended with a newline. Recorded for diagnostics only —
   * see the note in `encodeText` on why it is not enforced on save.
   */
  hadTrailingNewline: boolean;
}

export interface DecodedText {
  /** Normalized to LF, BOM removed. This is what the editor and parser see. */
  text: string;
  shape: TextShape;
}

/**
 * Picks the dominant line ending. Files with mixed endings — common once
 * several tools have touched them — are normalized to whichever form is more
 * frequent, rather than preserved exactly, since exact preservation would mean
 * tracking the ending of every individual line.
 */
function detectLineEnding(raw: string): LineEnding {
  let crlf = 0;
  let lf = 0;

  for (let i = 0; i < raw.length; i += 1) {
    if (raw[i] !== '\n') continue;
    if (i > 0 && raw[i - 1] === '\r') crlf += 1;
    else lf += 1;
  }

  return crlf > lf ? 'crlf' : 'lf';
}

export function decodeText(raw: string): DecodedText {
  const hadBom = raw.startsWith(BOM);
  const body = hadBom ? raw.slice(BOM.length) : raw;
  const text = body.replace(/\r\n/g, '\n');

  return {
    text,
    shape: {
      hadBom,
      lineEnding: detectLineEnding(body),
      hadTrailingNewline: text.length > 0 && text.endsWith('\n'),
    },
  };
}

/**
 * Restores the original encoding. Deliberately does NOT add or remove a
 * trailing newline: the text already carries its own, and there is no way to
 * tell a newline the user typed from one a tool added. Silently editing the
 * last byte of someone's file to satisfy a convention is the kind of thing that
 * makes a tool untrustworthy — `hadTrailingNewline` is for telling them, not
 * for fixing it behind their back.
 */
export function encodeText(text: string, shape: TextShape): string {
  let output = text;

  if (shape.lineEnding === 'crlf') output = output.replace(/\n/g, '\r\n');
  if (shape.hadBom) output = BOM + output;

  return output;
}
