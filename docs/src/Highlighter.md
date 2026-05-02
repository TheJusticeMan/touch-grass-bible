# VanJS Recursive Text Highlighter

A robust, type-safe utility for parsing and highlighting text using regular expressions in [VanJS](https://vanjs.org/). It supports deeply nested highlighting (e.g., parsing markdown-like syntax) and safely manages stateful global regular expressions to prevent common `lastIndex` bugs.

## Dependencies

- `vanjs-core`: Required for the `ChildDom` type and UI rendering.

## API Reference

### `HighlightType`

A strict discriminated union defining a highlighting pattern. It dictates whether a pattern is a leaf node (receives a `string`) or a branch node (receives `ChildDom` and contains `children`).

```typescript
export type HighlightType =
  | {
      // The regular expression to match.
      // Note: The 'g' flag is automatically applied internally if missing.
      regEXP: RegExp;
      children?: never;
      // Callback receives the raw matched string (or the first capture group).
      callback: (content: string) => ChildDom;
    }
  | {
      regEXP: RegExp;
      // Nested patterns to apply to the matched content of this regex.
      children: HighlightType[];
      // Callback receives the recursively processed ChildDom.
      callback: (content: ChildDom) => ChildDom;
    };
```

### `highlight(text: string, patterns: HighlightType[]): ChildDom`

Parses a string and applies the provided array of highlighting patterns.

**Parameters:**

- `text` (`string`): The raw input string to be parsed.
- `patterns` (`HighlightType[]`): An array of pattern definitions to apply to the text. Patterns are evaluated in order; the first earliest match in the string takes precedence.

**Returns:**

- `ChildDom`: An array of strings and VanJS DOM elements ready to be appended to a VanJS component.

---

## Usage Examples

### 1. Basic Highlighting (Flat)

Highlighting simple mentions or hashtags without nesting.

```typescript
import van from "vanjs-core";
import { highlight, HighlightType } from "./highlight";

const { div, span, b } = van.tags;

const patterns: HighlightType[] = [
  {
    regEXP: /@(\w+)/, // Matches @username
    callback: match => b({ style: "color: blue;" }, `@${match}`),
  },
  {
    regEXP: /#(\w+)/, // Matches #hashtag
    callback: match => span({ style: "color: green;" }, `#${match}`),
  },
];

const text = "Hello @world, welcome to #vanjs!";
const ui = div(highlight(text, patterns));

van.add(document.body, ui);
```

### 2. Advanced Nested Highlighting (Recursive)

Handling markdown-like syntax where elements can be inside other elements.

```typescript
import van from "vanjs-core";
import { highlight, HighlightType } from "./highlight";

const { div, b, i, span } = van.tags;

const nestedPatterns: HighlightType[] = [
  {
    // Match bold text: **text**
    regEXP: /\*\*(.*?)\*\*/,
    // Define children that can exist inside bold text
    children: [
      {
        // Match italic text: *text*
        regEXP: /\*(.*?)\*/,
        callback: content => i(content),
      },
    ],
    callback: content => b(content),
  },
  {
    // Match standalone italic text: *text*
    regEXP: /\*(.*?)\*/,
    callback: content => i(content),
  },
];

// The word "Nested" will be both bold and italic!
const text = "This is **bold and *Nested* text**.";
const ui = div(highlight(text, nestedPatterns));

van.add(document.body, ui);
```

---

## Architecture & Safety Features

This utility was designed with several safeguards to handle the notoriously tricky behavior of JavaScript's `RegExp` objects:

1. **Stateful Regex Isolation:** The function clones the provided regex patterns internally `new RegExp(p.regEXP.source, flags)`. This prevents global `lastIndex` mutation bugs, ensuring that successive calls to `highlight` do not interfere with each other or skip text.
2. **Infinite Loop Guard:** The parsing cursor is advanced using `Math.max(1, matchText.length)`. This guarantees that even if a user provides a regex that results in a zero-length match (e.g., `/\b/`), the while-loop will not freeze the browser.
3. **Strict Type Discrimination:** By using a discriminated union for `HighlightType`, TypeScript ensures that you cannot accidentally define `children` without updating the `callback` signature to expect `ChildDom` instead of a `string`.
4. **Capture Group Fallback:** The engine intelligently attempts to pass the first capture group (`bestMatch[1]`) to the callback/recursion. If no capture group is defined, it falls back to the entire matched text (`bestMatch[0]`).
