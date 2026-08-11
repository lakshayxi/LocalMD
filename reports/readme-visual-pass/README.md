# README visual pass

Generated 2026-08-11 against `http://localhost:4173`.

The 20 most-starred GitHub repositories at time of capture, rendered in LocalMD.
READMEs are the most common document this product opens and the harshest input it
gets. Screenshots are in `screenshots/`.

## Objective checks

| Check | Result |
| --- | --- |
| Rendered without throwing | 20/20 |
| No horizontal page overflow | 20/20 |
| No console errors | 20/20 |
| No cross-origin requests | 20/20 |

## Per document

| Repository | Size | Render | Headings | Code (lit) | Tables | Blocked img | Unresolved img |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 996icu/996.ICU | 7KB | 311ms | 15 | 0 (0) | 0 | 4 | 0 |
| EbookFoundation/free-programming-books | 15KB | 319ms | 15 | 0 (0) | 0 | 18 | 0 |
| TheAlgorithms/Python | 3KB | 185ms | 5 | 0 (0) | 0 | 9 | 0 |
| awesome-selfhosted/awesome-selfhosted | 320KB | 2821ms | 103 | 0 (0) | 0 | 3 | 1 |
| codecrafters-io/build-your-own-x | 46KB | 380ms | 35 | 0 (0) | 0 | 2 | 0 |
| donnemartin/system-design-primer | 107KB | 1691ms | 172 | 10 (3) | 10 | 1 | 38 |
| freeCodeCamp/freeCodeCamp | 6KB | 218ms | 11 | 0 (0) | 0 | 5 | 0 |
| jwasham/coding-interview-university | 133KB | 2186ms | 110 | 8 (2) | 0 | 4 | 0 |
| n8n-io/n8n | 4KB | 220ms | 9 | 2 (0) | 0 | 2 | 0 |
| nilbuild/developer-roadmap | 9KB | 299ms | 7 | 2 (1) | 0 | 14 | 0 |
| ossu/computer-science | 29KB | 308ms | 27 | 0 (0) | 16 | 3 | 2 |
| practical-tutorials/project-based-learning | 51KB | 451ms | 50 | 0 (0) | 0 | 2 | 0 |
| public-apis/public-apis | 225KB | 3539ms | 58 | 0 (0) | 52 | 9 | 1 |
| react/react | 5KB | 385ms | 9 | 1 (1) | 0 | 5 | 0 |
| sindresorhus/awesome | 78KB | 663ms | 29 | 0 (0) | 0 | 3 | 1 |
| tensorflow/tensorflow | 10KB | 293ms | 9 | 4 (2) | 2 | 20 | 0 |
| torvalds/linux | 6KB | 203ms | 15 | 0 (0) | 0 | 0 | 0 |
| trimstray/the-book-of-secret-knowledge | 207KB | 8738ms | 456 | 294 (290) | 3 | 6 | 0 |
| vinta/awesome-python | 81KB | 927ms | 81 | 0 (0) | 0 | 0 | 0 |
| vuejs/vue | 8KB | 209ms | 13 | 0 (0) | 1 | 18 | 0 |

## Notes

- **Blocked images are expected, not defects.** Badge rows are the most common
  remote content in a README; they render as labelled placeholders with a
  one-click load, which is the designed behaviour.
- **Unresolved images are also expected.** A file opened through the picker has
  no base directory, so a relative path cannot resolve. Opening a folder is the
  planned fix and is a post-MVP item.

## Performance

Slowest: `trimstray/the-book-of-secret-knowledge` at 8738ms for 207KB
with 290 highlighted code blocks — roughly 30ms each.

For comparison `awesome-selfhosted/awesome-selfhosted` is 320KB
with no code blocks and renders in 2821ms.

**Syntax highlighting dominates render cost, not document size.** This is the
bottleneck the plan predicted, and it is above the Gate B budget (250KB in
under 600ms). It is not a Gate A criterion — Gate A covers correctness and
privacy — but it is the clearest thing to fix next.

The scheduled fix is M5: move the pipeline into a worker and highlight blocks
lazily as they approach the viewport, so a document paints immediately and
upgrades in place rather than blocking on 290 blocks the reader cannot see.

**No objective failures.**
