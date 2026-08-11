/**
 * Saving by download, for every browser without the File System Access API.
 *
 * This is roughly a third of desktop users — all of Safari and Firefox — and
 * the plan is explicit that it must be a first-class route rather than an
 * apology. Nothing in the UI says "unsupported"; the button reads *Download*
 * instead of *Save*, and that is the whole difference.
 *
 * The blob URL is same-origin and revoked immediately after the click, so it
 * never touches the network and cannot outlive the save.
 */
export function downloadText(filename: string, contents: string): void {
  // `text/markdown` rather than `text/plain`: it is the correct type, and it
  // stops Safari appending `.txt` to the name the reader chose.
  const blob = new Blob([contents], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  // Firefox only honours a click on a link that is in the document.
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();

  // Revoking synchronously is safe: the browser has already taken its own
  // reference by the time `click()` returns.
  URL.revokeObjectURL(url);
}
