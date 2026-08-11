import { BlobFileSource, isAcceptedFilename } from './sources';
import { UnsupportedFileError } from './types';

/**
 * Entry points for getting a file into the app.
 *
 * The File System Access API is Chromium-only, so this deliberately uses the
 * universal `<input type="file">` path for now. The FSA adapter arrives in M4
 * alongside saving, which is the only thing it actually buys us — for *opening*
 * a document the two are equivalent, and shipping one code path in M1 is
 * simpler than shipping two.
 */

/** Opens the system file picker. Resolves null if the user cancels. */
export function pickFile(): Promise<BlobFileSource | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.md,.markdown,.mdown,.mkd,.mdx,.txt,text/markdown,text/plain';

    // There is no cancel event for file inputs. `cancel` is supported in modern
    // browsers; the focus fallback covers the rest so the promise never leaks.
    input.addEventListener('cancel', () => resolve(null), { once: true });

    input.addEventListener(
      'change',
      () => {
        const file = input.files?.[0];
        if (!file) {
          resolve(null);
          return;
        }
        try {
          resolve(new BlobFileSource(file));
        } catch (error) {
          reject(error);
        }
      },
      { once: true },
    );

    input.click();
  });
}

/**
 * Extracts a single Markdown file from a drop.
 *
 * Rejects directories explicitly. A dropped folder surfaces as a File with an
 * empty type that fails to read, so without this check the user would get a
 * parse error instead of being told that folders aren't supported yet.
 */
export async function sourceFromDrop(dataTransfer: DataTransfer): Promise<BlobFileSource> {
  const items = Array.from(dataTransfer.items).filter((item) => item.kind === 'file');

  for (const item of items) {
    const entry = item.webkitGetAsEntry?.();
    if (entry?.isDirectory) {
      throw new UnsupportedFileError(
        entry.name,
        'LocalMD opens one file at a time. Opening a folder is not supported yet.',
      );
    }
  }

  const files = Array.from(dataTransfer.files);
  const file = files.find((candidate) => isAcceptedFilename(candidate.name)) ?? files[0];

  if (!file) throw new UnsupportedFileError('', 'That drop contained no file.');

  return new BlobFileSource(file);
}
