/**
 * Defines the structure for highlighting configuration.
 * - `regEXP`: Regular expression used to find matches in the text.
 * - `elTag`: HTML element tag name for wrapping matched text.
 * - `cls`: Optional CSS class name to apply to the wrapping element.
 * - `replace?: string`: Optional string for replacing matched groups (uses regex replacement syntax).
 */
interface HighlightType {
  regEXP: RegExp; // Must include 'g' for global matching
  elTag?: string;
  cls?: string;
  replace?: string; // Optional replacement string, supports regex groups
}

/**
 * Provides functionality to highlight parts of a text based on multiple regular expressions,
 * wrapping matches in specified HTML elements with optional classes.
 */
export class Highlighter {
  args: HighlightType[];

  /**
   * Creates a new Highlighter instance.
   * @param args - An array of highlight configurations defining how to match and wrap text segments.
   */
  constructor(args: HighlightType[]) {
    this.args = args;
  }

  /**
   * Highlights matching segments in the provided text according to configured patterns.
   * This version processes matches sequentially without merging overlaps.
   * @param text - The input string to process for highlighting.
   * @returns A DocumentFragment containing the styled and unstyled segments of text.
   */
  highlight(text: string): DocumentFragment {
    // Internal interface for match details
    interface MatchInfo {
      start: number;
      end: number;
      type: HighlightType;
      matchText: string; // matched substring
    }

    // Collect all matches from all patterns
    let allMatches: MatchInfo[] = [];

    for (const patternConfig of this.args) {
      const regex = patternConfig.regEXP;

      let match: RegExpExecArray | null;
      if (regex.global)
        while ((match = regex.exec(text)) !== null) {
          allMatches.push({
            start: match.index,
            end: match.index + match[0].length,
            type: patternConfig,
            matchText: match[0],
          });
          // To prevent infinite loops with zero-length matches
          if (match[0].length === 0) {
            regex.lastIndex++;
          }
        }
      else if ((match = regex.exec(text)) !== null) {
        allMatches.push({
          start: match.index,
          end: match.index + match[0].length,
          type: patternConfig,
          matchText: match[0],
        });
      }
    }

    // Sort matches by their start position to process sequentially
    allMatches.sort((a, b) => a.start - b.start);

    // Build DocumentFragment
    const fragment = document.createDocumentFragment();
    let currentIndex = 0;

    for (const match of allMatches) {
      if (match.start > currentIndex) {
        // Append unstyled text before the match
        fragment.appendChild(document.createTextNode(text.substring(currentIndex, match.start)));
      }

      // Create the element for the match
      const element = document.createElement(match.type.elTag || "span");
      if (match.type.cls) {
        element.className = match.type.cls;
      }

      // Use replace string if provided; else, default to the matched text
      const content = match.matchText.replace(match.type.regEXP, match.type.replace || "$1");

      element.textContent = content;
      fragment.appendChild(element);
      currentIndex = match.end;
    }

    // Append remaining unstyled text
    if (currentIndex < text.length) {
      fragment.appendChild(document.createTextNode(text.substring(currentIndex)));
    }

    return fragment;
  }
}

// Usage Example
if (false) {
  const highlightedFragment = new Highlighter([
    {
      regEXP: /\[(.+?)\]/gi,
      elTag: "i",
    },
    {
      regEXP: /(LORD|God)/gi,
      elTag: "b",
    },
    {
      regEXP: /^(\d+)/i,
      elTag: "b",
      cls: "number-prefix",
      replace: "$1", // optional, in case you want to adjust displayed text
    },
  ]).highlight(
    "2 And the earth was without form, and void; and darkness [was] upon the face of the deep. And the Spirit of God moved upon the face of the waters."
  );

  // Append the fragment to the DOM, for example
  document.body.appendChild(highlightedFragment);
}
