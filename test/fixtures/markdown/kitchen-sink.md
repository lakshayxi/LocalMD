---
title: Kitchen Sink
tags: [fixture, gfm]
---

# Kitchen Sink

The broad-coverage fixture. Every construct LocalMD claims to support appears
here at least once, so a regression in any of them shows up as a snapshot diff.

## Inline formatting

Regular text with **bold**, *italic*, ***both***, `inline code`, ~~strikethrough~~,
a [link](https://example.com), and an autolink: https://example.com/auto

Footnote reference[^1] and a second one[^note].

[^1]: The first footnote.
[^note]: A named footnote with `code` inside.

## Heading hierarchy

### H3 follows H2 correctly

#### H4 follows H3 correctly

## Lists

- Unordered item
- Another item
  - Nested item
    - Deeply nested
- Item with a paragraph

  Continuation paragraph inside the list item.

1. Ordered item
2. Second
   1. Nested ordered
10. Non-sequential numbering

## Task lists

- [x] Completed task
- [ ] Incomplete task
- [ ] Task with **formatting** and `code`

## Code

Indented code block:

    plain indented code
    second line

Fenced without a language:

```
no language hint
```

Fenced with a language:

```typescript
interface DocumentSource {
  name: string;
  canSaveInPlace: boolean;
}
```

Fenced with an unknown language (must render as plain, not error):

```notarealanguage
this should still render
```

## Tables

| Left | Center | Right | Default |
| :--- | :----: | ----: | ------- |
| a    |   b    |     c | d       |
| `code` | **bold** | [link](https://example.com) | ~~strike~~ |

## Blockquotes

> A blockquote.
>
> > Nested deeper.
>
> - With a list
> - Inside it

## Images

Local relative image (unresolvable from a picked file — must show a placeholder):

![local diagram](./diagram.png)

Remote image (must be blocked by default):

![remote badge](https://img.shields.io/badge/test-passing-green)

## Raw HTML

<details>
<summary>Collapsed section</summary>

Content inside `details`, which READMEs rely on heavily.

</details>

Press <kbd>Cmd</kbd>+<kbd>S</kbd> to save.

Text with a line break<br>after it.

<p align="center">Centered paragraph, common in READMEs.</p>

## Horizontal rules

---

## Escaping

Literal asterisks: \*not italic\*

Literal backticks: `` ` ``

HTML entities: &amp; &lt; &gt; &copy;
