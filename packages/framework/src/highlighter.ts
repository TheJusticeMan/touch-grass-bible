/* eslint-disable security/detect-non-literal-regexp */
import { ChildDom } from "vanjs-core";

// Strict Discriminated Union
export type HighlightRule =
  | {
      regEXP: RegExp;
      children?: never;
      callback: (content: string) => ChildDom;
    }
  | {
      regEXP: RegExp;
      children: HighlightRule[];
      callback: (content: ChildDom) => ChildDom;
    };

export function highlight(text: string, patterns: HighlightRule[]): ChildDom {
  // 1. Clone regexes ONCE per function call for performance and render safety.
  // We cast back to HighlightRule[] because mapping spreads the union,
  // but we know we are strictly preserving the original structure.
  const safePatterns = patterns.map(p => {
    const flags = p.regEXP.flags.includes("g") ? p.regEXP.flags : `${p.regEXP.flags}g`;
    return {
      ...p,
      regEXP: new RegExp(p.regEXP.source, flags),
    };
  }) as HighlightRule[];

  const result: ChildDom[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    let bestMatch: RegExpExecArray | null = null;
    let bestType: HighlightRule | undefined;

    for (const p of safePatterns) {
      // lastIndex mutation is now perfectly safe because safePatterns is
      // scoped strictly to this specific execution of highlight().
      p.regEXP.lastIndex = cursor;
      const match = p.regEXP.exec(text);

      if (match && (!bestMatch || match.index < bestMatch.index)) {
        bestMatch = match;
        bestType = p;
      }
    }

    if (!bestMatch || !bestType) break;

    // Push preceding text
    if (bestMatch.index > cursor) {
      result.push(text.slice(cursor, bestMatch.index));
    }

    const matchText = bestMatch[0];
    const rawText = bestMatch[1] ?? matchText;

    // TypeScript safely discriminates the callback signature based on the presence of children
    if (bestType.children) {
      result.push(bestType.callback(highlight(rawText, bestType.children)));
    } else {
      result.push(bestType.callback(rawText));
    }

    // Advance cursor (Math.max prevents infinite loops on zero-length matches)
    cursor = bestMatch.index + Math.max(1, matchText.length);
  }

  return (cursor < text.length ? [...result, text.slice(cursor)] : result) as ChildDom;
}
