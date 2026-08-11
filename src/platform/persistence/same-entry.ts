/**
 * Handle comparison that cannot take the calling feature down with it.
 *
 * A stored entry that has lost its methods — an older schema, a partially
 * written record, an engine whose serialization differs — would otherwise throw
 * on the first comparison and abort the enclosing write, so a single bad row
 * would silently stop *every* future document from being recorded. Treating an
 * uncomparable entry as "not this file" costs at worst one duplicate row.
 *
 * Shared by recents and drafts because both key on file identity rather than on
 * filename: two different `README.md` files from different projects are
 * different documents, and the same file moved is still the same file.
 */
export async function isSameEntry(
  stored: FileSystemFileHandle | null,
  candidate: FileSystemFileHandle | null,
): Promise<boolean> {
  if (!stored || !candidate) return false;

  try {
    return await stored.isSameEntry(candidate);
  } catch {
    return false;
  }
}
