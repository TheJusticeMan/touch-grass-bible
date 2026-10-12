import { EditorState, Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { markdown } from "@codemirror/lang-markdown";
import { history, defaultKeymap, historyKeymap, indentWithTab } from "@codemirror/commands";
import van, { State } from "vanjs-core";
import { livePreviewPlugin } from "./livePreviewPlugin";
import { interactiveTaskLists } from "./taskListPlugin";
import "./MarkdownEditor.css";

const editorTheme = EditorView.theme({
  "&": {
    fontSize: "inherit",
    fontFamily: "inherit",
  },
  ".cm-scroller": {
    overflow: "visible",
    fontFamily: "inherit",
  },
  ".cm-content": {
    padding: "8px 12px",
    caretColor: "var(--color-text, inherit)",
    minHeight: "6rem",
  },
  ".cm-focused": { outline: "none" },
  ".cm-line": { padding: "0" },
  ".cm-heading": { fontWeight: "bold", textDecoration: "none" },
  ".cm-heading-1": { fontSize: "1.8em", lineHeight: "1.3" },
  ".cm-heading-2": { fontSize: "1.5em", lineHeight: "1.35" },
  ".cm-heading-3": { fontSize: "1.25em", lineHeight: "1.4" },
  ".cm-heading-4": { fontSize: "1.1em", lineHeight: "1.45" },
  ".cm-heading-5": { fontSize: "1em", lineHeight: "1.5" },
  ".cm-heading-6": { fontSize: "0.9em", lineHeight: "1.5" },
  // defaultHighlightStyle underlines ATX heading tokens; cancel it
  ".cm-line.cm-heading span": { textDecoration: "none" },
  ".cm-hr-preview": {
    border: "none",
    borderTop: "1px solid var(--border-color, #444)",
    margin: "12px 0",
    display: "block",
    width: "100%",
  },
});

export interface MarkdownEditorOptions {
  content: State<string>;
  extensions?: Extension[];
}

export function MarkdownEditor(options: MarkdownEditorOptions): HTMLElement {
  const { content, extensions = [] } = options;

  const updateListener = EditorView.updateListener.of(update => {
    if (update.docChanged) {
      const newValue = update.state.doc.toString();
      if (newValue !== content.rawVal) {
        content.val = newValue;
      }
    }
  });

  const state = EditorState.create({
    // rawVal reads the current value without registering a reactive dependency
    doc: content.rawVal,
    extensions: [
      markdown(),
      syntaxHighlighting(defaultHighlightStyle),
      livePreviewPlugin,
      interactiveTaskLists,
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
      EditorView.lineWrapping,
      editorTheme,
      updateListener,
      ...extensions,
    ],
  });

  const wrapper = van.tags.div({ class: "cm-markdown-editor" });
  const view = new EditorView({ state, parent: wrapper });

  const observer = new MutationObserver(() => {
    if (!wrapper.isConnected) {
      view.destroy();
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  return wrapper;
}
