import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate, WidgetType } from "@codemirror/view";
import { Extension, RangeSetBuilder } from "@codemirror/state";
import van from "vanjs-core";

// Matches the full bullet + checkbox: e.g. "- [ ] " or "  * [x] "
const TASK_RE = /^(\s*(?:[-*+]|\d+[.)])\s+)(\[([ xX])\])(\s?)/;

function selectionTouches(view: EditorView, from: number, to: number): boolean {
  return view.state.selection.ranges.some(r => r.from <= to && r.to >= from);
}

class TaskCheckboxWidget extends WidgetType {
  // spanFrom: doc position of the start of the bracket token, used to locate the line on click
  // from: doc position of the start of the full bullet+checkbox span
  constructor(
    readonly isChecked: boolean,
    readonly spanFrom: number,
    readonly spanTo: number,
  ) {
    super();
  }

  eq(other: TaskCheckboxWidget): boolean {
    return this.isChecked === other.isChecked;
  }

  toDOM(view: EditorView): HTMLElement {
    const wrap = van.tags.span({ class: "cm-task-checkbox-wrap" }) as HTMLSpanElement;
    const input = van.tags.input({
      type: "checkbox",
      checked: this.isChecked,
      class: "cm-task-checkbox",
    }) as HTMLInputElement;

    input.addEventListener("click", e => {
      e.stopPropagation();
      const line = view.state.doc.lineAt(this.spanFrom);
      const match = line.text.match(TASK_RE);
      if (match) {
        const bracketStart = line.from + match[1].length;
        const bracketEnd = bracketStart + match[2].length;
        const replacement = input.checked ? "[x]" : "[ ]";
        view.dispatch({ changes: { from: bracketStart, to: bracketEnd, insert: replacement } });
      }
    });

    wrap.appendChild(input);
    return wrap;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

function buildCheckboxDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to;) {
      const line = view.state.doc.lineAt(pos);
      const match = line.text.match(TASK_RE);
      if (match) {
        const leadingSpaces = (match[1].match(/^\s*/) ?? [""])[0].length;
        // Replace from the bullet char through the closing bracket + optional space
        const spanFrom = line.from + leadingSpaces;
        const spanTo = line.from + match[0].length;
        const isChecked = match[3].toLowerCase() === "x";
        if (!selectionTouches(view, line.from, spanTo)) {
          builder.add(
            spanFrom,
            spanTo,
            Decoration.replace({ widget: new TaskCheckboxWidget(isChecked, spanFrom, spanTo) }),
          );
        }
      }
      pos = line.to + 1;
    }
  }
  return builder.finish();
}

const taskListPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildCheckboxDecorations(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged || update.selectionSet) {
        this.decorations = buildCheckboxDecorations(update.view);
      }
    }
  },
  { decorations: v => v.decorations },
);

const taskCheckboxTheme = EditorView.baseTheme({
  ".cm-task-checkbox-wrap": {
    display: "inline-flex",
    alignItems: "center",
    verticalAlign: "middle",
    paddingRight: "0.35em",
  },
  ".cm-task-checkbox": {
    cursor: "pointer",
    margin: "0",
  },
});

export const interactiveTaskLists: Extension = [taskListPlugin, taskCheckboxTheme];
