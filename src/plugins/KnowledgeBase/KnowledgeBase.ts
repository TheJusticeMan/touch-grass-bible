import { highlight, MarkdownEditor, MenuVan, renderIcon, State, van, View } from "@touchgrass/framework";
import apocalypseThrottle from "apocalypse-throttle";
import { Bookmark, ChevronDown, ChevronRight, Pencil, Plus, Trash2, X } from "lucide";
import { OSIS, VerseRef } from "src/models/VerseRef";
import { VerseHighlightPatterns } from "src/ui/VerseScreen";
import Plugin from "../../core/Plugin";
import "./KnowledgeBase.css";
import { TopicLabels, VerseListCategory } from "./KnowledgeBaseCategorys";
import { KnowledgeBaseCategoryID, KnowledgeBaseVerseListCategoryID } from "../categoryIDs";

const { div, button, input, span, hr } = van.tags;

export type Topic = {
  id: number;
  title: State<string>;
  content: State<string>;
  verses: State<VerseRef[]>;
  children: State<number[]>;
};

type SerializedTopic = {
  id: number;
  title: string;
  content: string;
  verses: OSIS[]; // OSIS references
  children: number[]; // Child topic IDs
};

interface KnowledgeBasePluginSettings {
  topics: SerializedTopic[];
}

const defaultKnowledgeBaseSettings: KnowledgeBasePluginSettings = {
  topics: [
    {
      id: 0,
      title: "What is the meaning of life according to the Bible?",
      content:
        "The Bible suggests that the meaning of life is to love and serve God and others (Ecclesiastes 12:13, Matthew 22:37-39).",
      verses: ["Eccl.12.13", "Matt.22.37"],
      children: [],
    },
  ],
};

export default class KnowledgeBasePlugin extends Plugin {
  topics = van.state<Topic[]>([]);
  realTopics = van.derive(() => this.topics.val.filter(q => q.title.val || q.content.val));
  settings: KnowledgeBasePluginSettings = defaultKnowledgeBaseSettings;

  readonly currentTopic: State<Topic> = van.state({
    id: -1,
    title: van.state(""),
    content: van.state(""),
    verses: van.state([]),
    children: van.state([]),
  });

  async onload(): Promise<void> {
    // Load topics from storage
    this.settings = await this.loadSettings(defaultKnowledgeBaseSettings);
    this.topics = van.state(this.settings.topics.map(q => this.deserializeTopic(q)));
    this.realTopics = van.derive(() => this.topics.val.filter(q => q.title.val || q.content.val));
    van.derive(() => this.saveTopics(this.serializeTopics()));
    this.registerView("knowledge-base-index", () => new IndexView(this));
    this.registerView("knowledge-base-topic", () => new TopicView(this));
    this.registerPalette(KnowledgeBaseCategoryID, args => new TopicLabels(args.state, this));
    this.registerPalette(KnowledgeBaseVerseListCategoryID, args => new VerseListCategory(args.state, this));

    this.registerUnload(
      this.app.onVerseStateChange(verse => {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, "0");
        const day = String(now.getDate()).padStart(2, "0");
        const formattedDate = `${year}-${month}-${day}`;

        const topic = this.topics.val.find(topic => topic.title.val === formattedDate);
        if (topic) {
          topic.verses.val = [...topic.verses.val, verse];
        } else {
          this.topics.val = [
            ...this.topics.val,
            {
              id: this.genID(),
              title: van.state(formattedDate),
              content: van.state(""),
              verses: van.state([verse]),
              children: van.state([]),
            },
          ];
        }
      }),
    );
    this.addVerseAction({
      id: "tag-verse",
      name: "Bookmark verse",
      icon: Bookmark,
      onTrigger: verseInfo => this.syncTopicStatus(verseInfo),
    });
  }

  syncTopicStatus(verseInfo: { verse: VerseRef; event: Event; element: HTMLElement }) {
    const usedTopics = van.state(
      this.realTopics.val.filter(topic => topic.verses.val.some(v => v.isSame(verseInfo.verse))),
    );
    const isAddingTopic = van.state(false);
    const newTopicLabel = van.state("");

    const refreshUsedTopics = () => {
      usedTopics.val = this.realTopics.val.filter(topic =>
        topic.verses.val.some(v => v.isSame(verseInfo.verse)),
      );
    };

    const openTopic = (topic: Topic, event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      this.currentTopic.val = topic;
      this.openView({ topic: topic.id });
    };

    const addVerseToTopic = (topic: Topic) => {
      if (!topic.verses.val.some(v => v.isSame(verseInfo.verse))) {
        topic.verses.val = [...topic.verses.val, verseInfo.verse];
      }
      refreshUsedTopics();
    };

    const removeVerseFromTopic = (topic: Topic) => {
      topic.verses.val = topic.verses.val.filter(v => !v.isSame(verseInfo.verse));
      refreshUsedTopics();
    };

    const addTopicLabel = () => {
      const label = newTopicLabel.val.trim();
      if (!label) return;

      const existingTopic = this.realTopics.val.find(
        topic => topic.title.val.trim().toLowerCase() === label.toLowerCase(),
      );

      if (existingTopic) {
        addVerseToTopic(existingTopic);
      } else {
        const topic: Topic = {
          id: this.genID(),
          title: van.state(label),
          content: van.state(""),
          verses: van.state([verseInfo.verse]),
          children: van.state([]),
        };
        this.topics.val = [...this.topics.val, topic];
        this.currentTopic.val = topic;
      }

      newTopicLabel.val = "";
      isAddingTopic.val = false;
      window.setTimeout(refreshUsedTopics, 0);
    };

    van.add(
      verseInfo.element,
      div(
        { onclick: (e: Event) => e.stopPropagation() },
        () =>
          div(
            ...usedTopics.val.map(topic =>
              button(
                {
                  class: "bookmark-added",
                  onclick: () => removeVerseFromTopic(topic),
                  oncontextmenu: (event: Event) => openTopic(topic, event),
                },
                topic.title,
              ),
            ),
          ),
        () =>
          isAddingTopic.val
            ? div(
                input({
                  class: "note-area",
                  placeholder: "Enter topic label...",
                  value: () => newTopicLabel.val,
                  oninput: (event: Event) => (newTopicLabel.val = (event.target as HTMLInputElement).value),
                  onkeydown: (event: Event) => (event as KeyboardEvent).key === "Enter" && addTopicLabel(),
                }),
                button({ onclick: addTopicLabel }, "Add"),
              )
            : button(
                {
                  class: "icon-button",
                  onclick: () => {
                    isAddingTopic.val = true;
                    window.setTimeout(
                      () => verseInfo.element.querySelector<HTMLInputElement>(".note-area")?.focus(),
                      0,
                    );
                  },
                  "aria-label": "Add topic label",
                  title: "Add topic label",
                },
                renderIcon(Plus),
              ),
        () => {
          const unusedTopics = this.realTopics.val.filter(
            topic => !usedTopics.val.some(usedTopic => usedTopic.id === topic.id),
          );
          return unusedTopics.length > 0 ? hr() : null;
        },
        () => {
          const unusedTopics = this.realTopics.val.filter(
            topic => !usedTopics.val.some(usedTopic => usedTopic.id === topic.id),
          );

          return div(
            ...unusedTopics.map(topic =>
              button(
                {
                  class: "bookmark-not-added",
                  onclick: () => addVerseToTopic(topic),
                  oncontextmenu: (event: Event) => openTopic(topic, event),
                },
                topic.title,
              ),
            ),
          );
        },
      ),
    );
  }

  genID() {
    return Math.max(0, ...this.topics.val.map(q => q.id)) + 1;
  }

  createTopic(title: string, content: string, verses: VerseRef[] = [], children: number[] = []): Topic {
    const topic: Topic = {
      id: this.genID(),
      title: van.state(title.trim()),
      content: van.state(content.trim()),
      verses: van.state(this.uniqueVerses(verses)),
      children: van.state([...new Set(children)]),
    };

    this.topics.val = [...this.topics.val, topic];
    this.currentTopic.val = topic;
    return topic;
  }

  serializeTopics(topics: Topic[] = this.realTopics.val): SerializedTopic[] {
    const realTopicIds = new Set(topics.map(topic => topic.id));

    return topics.map(topic => ({
      id: topic.id,
      title: topic.title.val,
      content: topic.content.val,
      verses: this.uniqueVerses(topic.verses.val).map(verse => verse.toOSIS()),
      children: [
        ...new Set(topic.children.val.filter(childId => childId !== topic.id && realTopicIds.has(childId))),
      ],
    }));
  }

  private uniqueVerses(verses: VerseRef[]): VerseRef[] {
    const seen = new Set<string>();
    const deduped: VerseRef[] = [];

    for (const verse of verses) {
      const key = verse.toOSIS();
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(verse);
    }

    return deduped;
  }

  openView(state: { topic: number }) {
    const view = this.app.workspace.layout.findOrCreateViewById("knowledge-base-topic", {
      id: state.topic,
    });
    (view as TopicView).state.id.val = state.topic;
  }

  deserializeTopic({ id, title, content, verses, children }: SerializedTopic): Topic {
    return {
      id,
      title: van.state(title),
      content: van.state(content),
      verses: van.state(verses.map(osis => VerseRef.fromOSIS(osis))),
      children: van.state(children),
    };
  }

  saveTopics = apocalypseThrottle((topics: SerializedTopic[]) => this.saveSettings({ topics }), 1000);
}

class IndexView extends View {
  viewTypeId = "knowledge-base-index";
  // Each expanded entry stores the full node path [...parents, currentId].
  expandedTopics = van.state<number[][]>([]);

  constructor(public plugin: KnowledgeBasePlugin) {
    super("Knowledge Base", {}, null);
  }

  private isPathExpanded(path: number[]): boolean {
    return this.expandedTopics.val.some(
      expandedPath =>
        expandedPath.length === path.length && expandedPath.every((id, idx) => id === path[idx]),
    );
  }

  create() {
    const renderChildren = (topics: Topic[], parents: number[]): Element[] =>
      topics.map(q => {
        const hasChildren = q.children.val.length > 0 && !parents.includes(q.id);
        const nodePath = [...parents, q.id];
        const isExpanded = this.isPathExpanded(nodePath);
        return div(
          {
            class: "kb-tree-node",
          },
          div(
            { class: "kb-tree-row" },
            hasChildren
              ? span(
                  {
                    class: `expand-toggle ${isExpanded ? "is-expanded" : "is-collapsed"}`,
                    onclick: (e: MouseEvent) => {
                      e.stopPropagation();
                      if (isExpanded) {
                        this.expandedTopics.val = this.expandedTopics.val.filter(
                          expandedPath =>
                            expandedPath.length !== nodePath.length ||
                            expandedPath.some((id, idx) => id !== nodePath[idx]),
                        );
                      } else {
                        this.expandedTopics.val = [...this.expandedTopics.val, nodePath];
                      }
                    },
                  },
                  () => renderIcon(isExpanded ? ChevronDown : ChevronRight),
                )
              : span({ class: "expand-toggle is-empty" }),
            div(
              {
                class: "topic-item",
                onclick: () => this.plugin.openView({ topic: q.id }),
                oncontextmenu: (e: MouseEvent) => {
                  e.preventDefault();
                  new MenuVan([
                    {
                      title: "Edit Topic",
                      icon: Pencil,
                      onClick: () => this.plugin.openView({ topic: q.id }),
                    },
                    {
                      title: "Add Child Topic",
                      icon: Plus,
                      onClick: () => {
                        const newId = this.plugin.genID();
                        q.children.val = [...q.children.val, newId];

                        this.plugin.openView({ topic: newId });
                      },
                    },
                    {
                      title: "Delete Topic",
                      icon: Trash2,
                      onClick: () =>
                        (this.plugin.topics.val = this.plugin.topics.val.filter(quest => quest !== q)),
                    },
                  ]).showAtMouseEvent(e);
                },
              },
              span({ class: "topic-label" }, q.title),
            ),
          ),
          hasChildren && isExpanded
            ? div(
                { class: "kb-tree-children" },
                renderChildren(
                  q.children.val
                    .map(id => this.plugin.realTopics.val.find(quest => quest.id === id))
                    .filter(Boolean) as Topic[],
                  [...parents, q.id],
                ),
              )
            : null,
        );
      });
    return div({ class: "knowledge-base-index" }, () =>
      div(
        renderChildren(this.plugin.realTopics.val, []),
        span(
          { class: "icon-button", onclick: () => this.plugin.openView({ topic: this.plugin.genID() }) },
          renderIcon(Plus),
        ),
      ),
    );
  }
}

class TopicView extends View<{ id: number }> {
  viewTypeId = "knowledge-base-topic";

  readonly cTopic: State<Topic>;

  constructor(public plugin: KnowledgeBasePlugin) {
    super("Knowledge Base Topic", { id: plugin.genID() }, null);
    this.cTopic = van.derive(
      () =>
        this.plugin.topics.val.find(q => q.id === this.state.id.val) || {
          id: this.state.id.val,
          title: van.state(""),
          content: van.state(""),
          verses: van.state([]),
          children: van.state([]),
        },
    );
    van.derive(() => {
      if (this.cTopic.val.title.val && !this.plugin.topics.val.some(q => q.id === this.cTopic.val.id)) {
        this.plugin.topics.val = [...this.plugin.topics.val, this.cTopic.val];
      }
    });
    van.derive(() => {
      if (this.cTopic.val.id === -1) return;
      this.plugin.currentTopic.val = this.cTopic.val;
    });
    van.derive(() => {
      this.title.val = this.cTopic.val.title.val || "New Topic";
    });
  }

  focus() {
    (this.el?.querySelector("div.cm-content") as HTMLElement)?.focus();
  }

  create(): HTMLElement {
    return div(
      { class: "knowledge-base-topic" },
      div(
        { class: "topic-editor" },
        input({
          class: "topic-title-input",
          value: this.cTopic.val.title,
          placeholder: "Untitled",
          oninput: e => (this.cTopic.val.title.val = e.target.value),
        }),
        MarkdownEditor({ content: this.cTopic.val.content }),
        () =>
          div(
            { class: "verses" },
            "Verses:",
            this.cTopic.val.verses.val.map(v =>
              div(
                {
                  class: "verse",
                  onclick: () => (
                    this.plugin.app.workspace.layout.findOrCreateViewById("verse-screen"),
                    (this.plugin.app.verseState.val = v)
                  ),
                },
                v.toString(),
                div(highlight(v.text(this.plugin.app.translationState.val), VerseHighlightPatterns)),
                span(
                  {
                    class: "icon-button delete",
                    onclick: () => {
                      this.cTopic.val.verses.val = this.cTopic.val.verses.val.filter(
                        verse => !verse.isSame(v),
                      );
                    },
                  },
                  renderIcon(X),
                ),
              ),
            ),
            span(
              {
                class: "icon-button",
                onclick: () => this.plugin.app.workspace.layout.findOrCreateViewById("verse-screen"),
              },
              renderIcon(Plus),
            ),
          ),
        () =>
          div(
            { class: "children" },
            "Related Topics:",
            this.cTopic.val.children.val.map(childId => {
              const child = this.plugin.topics.val.find(q => q.id === childId);
              if (!child) return null;
              return div(
                {
                  class: "child-topic",
                  onclick: () => (this.state.id.val = childId),
                },
                child.title,
                span(
                  {
                    class: "icon-button delete",
                    onclick: () => {
                      this.cTopic.val.children.val = this.cTopic.val.children.val.filter(
                        id => id !== childId,
                      );
                    },
                  },
                  renderIcon(X),
                ),
              );
            }),
            span(
              {
                class: "icon-button",
                onclick: (event: MouseEvent) => {
                  new MenuVan([
                    ...this.plugin.realTopics.val
                      .filter(q => q.title.val)
                      .map(q => ({
                        title: q.title.val,
                        onClick: () => {
                          if (!this.cTopic.val.children.val.includes(q.id)) {
                            this.cTopic.val.children.val = [...this.cTopic.val.children.val, q.id];
                          }
                        },
                      })),
                    {
                      title: "Create New Topic",
                      onClick: () => {
                        const newId = this.plugin.genID();
                        this.cTopic.val.children.val = [...this.cTopic.val.children.val, newId];

                        this.state.id.val = newId;
                      },
                    },
                  ]).showAtMouseEvent(event);
                },
              },
              renderIcon(Plus),
            ),
          ),
      ),
    );
  }

  deserializeState(str: string): { id: number } {
    const parsed = JSON.parse(str) as { id?: number | null; topic?: number | null };
    const resolvedId = parsed.id ?? parsed.topic;
    return { id: typeof resolvedId === "number" ? resolvedId : this.plugin.genID() };
  }

  serializeState(): string {
    return JSON.stringify({ id: this.state.id.val });
  }
}
