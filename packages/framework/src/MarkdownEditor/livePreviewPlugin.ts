import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate, WidgetType } from "@codemirror/view";
import { Range, RangeSet, Extension } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import van from "vanjs-core";

class HrWidget extends WidgetType {
  toDOM() {
    return van.tags.hr({ class: "cm-hr-preview" });
  }
}

class ListBulletWidget extends WidgetType {
  constructor(readonly depth: number) {
    super();
  }

  eq(other: ListBulletWidget): boolean {
    return this.depth === other.depth;
  }

  toDOM(): HTMLElement {
    const el = van.tags.span({ class: "cm-list-bullet" }) as HTMLSpanElement;
    el.style.paddingLeft = `${(this.depth - 1) * 1.5}em`;
    el.textContent = "\u2022\u00A0";
    return el;
  }
}

class ListNumberWidget extends WidgetType {
  constructor(
    readonly depth: number,
    readonly marker: string,
  ) {
    super();
  }

  eq(other: ListNumberWidget): boolean {
    return this.depth === other.depth && this.marker === other.marker;
  }

  toDOM(): HTMLElement {
    const el = van.tags.span({ class: "cm-list-number" }) as HTMLSpanElement;
    el.style.paddingLeft = `${(this.depth - 1) * 1.5}em`;
    el.textContent = `${this.marker}\u00A0`;
    return el;
  }
}

function selectionIntersects(view: EditorView, from: number, to: number): boolean {
  return view.state.selection.ranges.some(r => r.from <= to && r.to >= from);
}

function selectionOnLine(view: EditorView, pos: number): boolean {
  const line = view.state.doc.lineAt(pos);
  return view.state.selection.ranges.some(r => r.from <= line.to && r.to >= line.from);
}

const livePreviewViewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = this.buildDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged || update.selectionSet) {
        this.decorations = this.buildDecorations(update.view);
      }
    }

    buildDecorations(view: EditorView): DecorationSet {
      const decos: Range<Decoration>[] = [];
      const { doc } = view.state;

      for (const { from, to } of view.visibleRanges) {
        syntaxTree(view.state).iterate({
          from,
          to,
          enter: node => {
            const name = node.name;

            if (name.startsWith("ATXHeading")) {
              const level = name.slice(-1);
              const line = doc.lineAt(node.from);
              decos.push(Decoration.line({ class: `cm-heading cm-heading-${level}` }).range(line.from));
            }

            if (name === "HeaderMark") {
              if (!selectionOnLine(view, node.from)) {
                const nextChar = doc.sliceString(node.to, node.to + 1);
                const toPos = nextChar === " " ? node.to + 1 : node.to;
                decos.push(Decoration.replace({}).range(node.from, toPos));
              }
            }

            if (name === "EmphasisMark") {
              const parent = node.node.parent;
              if (parent && !selectionIntersects(view, parent.from, parent.to)) {
                decos.push(Decoration.replace({}).range(node.from, node.to));
              }
            }

            if (name === "CodeMark" && node.node.parent?.name === "InlineCode") {
              const parent = node.node.parent;
              if (!selectionIntersects(view, parent.from, parent.to)) {
                decos.push(Decoration.replace({}).range(node.from, node.to));
              }
            }

            if (name === "HorizontalRule") {
              if (!selectionOnLine(view, node.from)) {
                decos.push(Decoration.replace({ widget: new HrWidget() }).range(node.from, node.to));
              }
            }

            if (name === "ListMark") {
              if (selectionOnLine(view, node.from)) return;
              const line = doc.lineAt(node.from);
              // Skip task-list items - handled by taskListPlugin
              if (/^\s*(?:[-*+]|\d+[.)])\s+\[[ xX]\]/.test(line.text)) return;

              const listItem = node.node.parent;
              const listParent = listItem?.parent;
              if (!listItem || !listParent) return;

              let depth = 0;
              let cur = node.node.parent;
              while (cur) {
                if (cur.name === "BulletList" || cur.name === "OrderedList") depth++;
                cur = cur.parent;
              }

              const isOrdered = listParent.name === "OrderedList";
              const markerText = doc.sliceString(node.from, node.to);
              const nextChar = doc.sliceString(node.to, node.to + 1);
              const replaceEnd = nextChar === " " ? node.to + 1 : node.to;

              decos.push(
                Decoration.replace({
                  widget: isOrdered ? new ListNumberWidget(depth, markerText) : new ListBulletWidget(depth),
                }).range(line.from, replaceEnd),
              );
            }
          },
        });
      }

      return RangeSet.of(decos, true);
    }
  },
  { decorations: v => v.decorations },
);

const livePreviewTheme = EditorView.baseTheme({
  ".cm-list-bullet, .cm-list-number": {
    opacity: "0.75",
    verticalAlign: "baseline",
  },
});

export const livePreviewPlugin: Extension = [livePreviewViewPlugin, livePreviewTheme];
