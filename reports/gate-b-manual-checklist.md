# Gate B — the manual checklist

Everything here needs a **real `FileSystemFileHandle`, minted by the native file
picker**, which no test can produce: Playwright cannot drive OS chrome, and a
stand-in handle loses its methods to structured clone. These checks have been
referred to from source comments since M1 without ever being written down in one
place. This is that place.

Run the whole list on **Chrome** and again on **Edge**. Both are Chromium, and
that is the point: the File System Access implementations are close enough that
a difference between them is a bug, and far enough apart on permission prompts
that only doing one is not doing the check.

Firefox and Safari have no handles for user files at all. Their equivalent —
that saving degrades to a download rather than failing — is covered end to end
in `e2e/save.spec.ts` and needs nothing by hand.

## Before you start

```bash
npm run build && npx vite preview --port 4173 --strictPort
```

Use the built app, never `npm run dev`: the dev server relaxes the CSP, and one
of the things being checked is that nothing here needs a relaxed one. Work in a
scratch directory with a few real `.md` files, at least two of which share a
name in different folders.

Record the result of each check in the table at the bottom, with the browser and
the date. A check nobody wrote down did not happen.

---

## 1. Save in place

The core loop, and the only part of it that a picker-minted handle can prove.

1. **Open** a `.md` file through **Open Markdown** (the picker, not drag-drop).
2. Edit a line. The dirty marker appears.
3. Press **⌘S / Ctrl+S**. Expect a permission prompt the first time, then a
   toast naming the file.
4. Open the file in another editor. **The edit is there, and nothing else
   changed** — no reordered lines, no reflowed paragraphs.
5. Press ⌘S again with no edits. It writes without prompting a second time.

**Round-trip fidelity.** Repeat step 1–4 with a file that uses **CRLF**, one
with a **BOM**, and one with **no trailing newline**. After a save with no
edits, `git diff` on the file must be **empty**. A whole-file diff here is the
failure this product cannot afford.

## 2. Save As, and the identity change it causes

1. With a file open and edited, **⌘⇧S / Ctrl+Shift+S**, and save it under a new
   name.
2. The header now shows the **new** filename.
3. Edit again and press ⌘S. It writes to the **new** file. The original is
   untouched — check its mtime.

## 3. The conflict banner, in situ

`FileHandleSource.save` refuses to overwrite a file that changed underneath it;
this is the check that the refusal reaches the reader as something they can act
on rather than as a dead keystroke.

1. Open a file. Leave it **clean**.
2. In a terminal: `echo "changed elsewhere" >> that-file.md`.
3. Return to the browser window. The banner appears on focus, offering **one**
   answer — *Load the new version*. Take it; the new content is on screen.
4. Now edit the document so it is **dirty**, and append to the file again from
   the terminal.
5. Press ⌘S. **Nothing is written.** A message says the file changed on disk.
6. The banner now offers **three** answers. Check each, one per run:
   - **Save a copy** → picker opens, both versions survive.
   - **Keep mine** → the file becomes what is on screen.
   - **Discard mine, load theirs** → confirm prompt, then the file's content
     replaces the editor's, and the undo history does not reach back past it.
7. Repeat step 5 with the file **older** rather than newer — restore it from a
   backup, or `git checkout` it. It must still refuse. Any mismatch counts, not
   just a newer one.
8. Do steps 4–6 once entirely from the keyboard, through **⌘K**: the two
   destructive answers are in the palette precisely so a keyboard reader is not
   stranded once ⌘S starts refusing.

## 4. Recents: identity, not filename

1. Open `~/scratch/api/README.md`, then `~/scratch/web/README.md`.
2. The recents list shows **two** entries, not one.
3. Rename `~/scratch/api/README.md` to `API.md` and reopen it from recents.
   The same entry is reused — a file that moved is still the same file.
4. Delete a file and click its recent. It explains that the file could not be
   found, and **the dead row removes itself**.
5. Reload the page and click a recent. Expect a permission prompt, since a
   handle survives a reload but its grant does not.

## 5. Draft recovery against a real file

1. Open a file through the picker, edit it, and wait three seconds without
   typing (the idle flush).
2. **Kill the tab** — close it outright, or quit the browser. Do not use the
   close-document control, which is a decision rather than an accident and is
   supposed to discard.
3. Reopen the app. The draft is offered by name. **Restore** puts the text back,
   still unsaved, in Edit.
4. ⌘S writes it to the original file.
5. Repeat, but before reopening, **change the file on disk**. The restore now
   arrives with the conflict banner, and ⌘S refuses until answered.
6. Repeat, but before reopening, **delete the file**. The text still comes back;
   saving asks where to put it.
7. Edit the same file in two separate sessions, crashing each time. The offer
   lists it **once**, not twice — drafts supersede by handle identity.

## 6. The multi-tab warning

The behaviour this checklist exists for most recently. Everything below was
verified in a browser with OPFS handles, which clone through the channel and
answer `isSameEntry` exactly as picker handles do; what remains is to see it
with handles a person picked.

1. Open the same file in **two tabs**, both through the picker.
2. Both headers show **Open in 2 tabs**. Neither is locked, and both can edit.
3. Open a **third** tab on the same file. Both existing tabs say **3 tabs**.
4. Open `api/README.md` in one tab and `web/README.md` in another. **Neither
   warns.** Same name, different files — this is the check that the warning is
   about identity and not about text in a title bar.
5. In one tab, close the document with the wordmark. The other tab's pill
   disappears within a second or two.
6. With two tabs on one file, **save in tab A**, then press ⌘S in **tab B**.
   Tab B refuses and shows the conflict banner. This is the warning's whole
   purpose: B was told before it got there.
7. **Kill one tab** without a clean close — Force Quit, or kill the renderer
   from the browser's task manager. The other tab's warning clears itself
   within about twelve seconds. A warning that could stay wrong forever is the
   one failure this feature must not have.
8. In tab A, **Save As** to a new name. Tab B's warning clears, because they are
   no longer the same file.

## 7. First-run experience

The plan's own gate item: *a developer goes from landing page to reading their
own file in under ten seconds with no instructions.* Do it on a profile that has
never seen the app, with a stopwatch, and write down the number.

---

## Results

| Check | Chrome | Edge | Notes |
|---|---|---|---|
| 1. Save in place, round-trip fidelity | | | |
| 2. Save As identity change | | | |
| 3. Conflict banner in situ | | | |
| 4. Recents identity | | | |
| 5. Draft recovery against a real file | | | |
| 6. Multi-tab warning | | | |
| 7. First run under ten seconds | | | |

Browser versions, OS, and date:
