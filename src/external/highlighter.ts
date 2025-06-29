/**
 * Defines the structure for highlighting configuration.
 * - `regEXP`: Regular expression used to find matches in the text.
 * - `elTag`: HTML element tag name for wrapping matched text.
 * - `cls`: Optional CSS class name to apply to the wrapping element.
 * - `replace?: string`: Optional string for replacing matched groups (uses regex replacement syntax).
 */
export interface HighlightType {
  regEXP: RegExp; // Must include 'g' for global matching
  elTag?: string;
  cls?: string;
  replace?: string; // Optional replacement string, supports regex groups
  children?: HighlightType[]; // Optional nested highlights
}

/**
 * Provides functionality to highlight parts of a text based on multiple regular expressions,
 * wrapping matches in specified HTML elements with optional classes.
 */
export class Highlighter {
  /**
   * Creates a new Highlighter instance.
   * @param args - An array of highlight configurations defining how to match and wrap text segments.
   */
  constructor(public args: HighlightType[]) {}

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
      if (match.start === match.end) continue; // Skip zero-length matches
      if (match.start < currentIndex) continue; // Skip matches that overlap with previous ones

      // Create the element for the match
      const element = document.createElement(match.type.elTag || "span");
      if (match.type.cls) {
        element.className = match.type.cls;
      }

      // Use replace string if provided; else, default to the matched text
      const content = match.matchText.replace(match.type.regEXP, match.type.replace || "$1");
      if (match.type.children) {
        element.append(new Highlighter(match.type.children).highlight(content));
      } else {
        element.textContent = content;
      }
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

/**
 * Example usage:
 * const highlighter = new Highlighter([
 *   { regEXP: /\bimportant\b/g, elTag: "strong", cls: "highlight-important" },
 *   { regEXP: /\bnote\b/g, elTag: "em", cls: "highlight-note" },
 * ]);
 * const highlightedFragment = highlighter.highlight("This is an important note.");
 * document.body.appendChild(highlightedFragment);
 */
