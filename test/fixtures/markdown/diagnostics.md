# Diagnostics Fixture

Every construct here is something the diagnostics layer should flag. This file
is deliberately broken — do not "fix" it.

## Heading jump

#### This is an H4 directly under an H2

Skipping H3 is a heading hierarchy jump.

## Duplicate anchors

### Setup

First section named Setup.

### Setup

Second section with the same name, producing a duplicate slug.

## Empty links and images

An [](https://example.com) link with no text.

An image with no alt: ![](https://example.com/a.png)

A link with no href: [text]()

## Suspicious links

[Looks like docs](javascript:alert(1))

[Mismatched](https://evil.example.com "https://github.com")

## Unresolvable local image

![missing](./does-not-exist.png)

## Malformed fence

```typescript
const unclosed = "this fence is never closed";
