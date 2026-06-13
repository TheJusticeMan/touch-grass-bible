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

// Legacy HighlightType
export interface HighlightTypeLegacy {
  regEXP: RegExp;
  elTag?: string;
  cls?: string;
  replace?: string;
  children?: HighlightTypeLegacy[];
}

export class Highlighter {
  private patterns: HighlightRule[];

  constructor(public args: HighlightTypeLegacy[]) {
    const mapPatterns = (patterns: HighlightTypeLegacy[]): HighlightRule[] =>
      patterns.map((p): HighlightRule => {
        if (p.children) {
          // Branch Node
          return {
            regEXP: p.regEXP,
            children: mapPatterns(p.children),
            callback: (content: ChildDom) => {
              const el = document.createElement(p.elTag || "span");
              if (p.cls) el.className = p.cls;

              if (Array.isArray(content)) el.append(...content);
              else el.append(content as string | Node);

              return el;
            },
          };
        } else {
          // Leaf Node (Stricter string callback)
          return {
            regEXP: p.regEXP,
            callback: (content: string) => {
              const el = document.createElement(p.elTag || "span");
              if (p.cls) el.className = p.cls;

              // Emulate legacy `replace` logic perfectly natively in the callback
              if (p.replace !== undefined) {
                // Allows replacing static strings (like \u00B6) or swapping $1
                el.textContent = p.replace.replace("$1", content);
              } else {
                el.textContent = content;
              }

              return el;
            },
          };
        }
      });

    this.patterns = mapPatterns(args);
  }

  highlight = (text: string): DocumentFragment => {
    const fragment = document.createDocumentFragment();
    const result = highlight(text, this.patterns);

    if (Array.isArray(result)) fragment.append(...result);
    else fragment.append(result as string | Node);

    return fragment;
  };
}
