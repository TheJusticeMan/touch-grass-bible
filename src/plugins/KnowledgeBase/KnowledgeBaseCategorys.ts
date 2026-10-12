import { VerseRef } from "@touch-grass-bible";
import {
  CommandCategory,
  CommandItem,
  CommandPaletteState,
  renderIcon,
  State,
  stateMapping,
  van,
} from "@touchgrass/framework";
import {
  KnowledgeBaseCategoryID,
  KnowledgeBaseVerseListCategoryID,
  TSKCrossRefCategoryID,
} from "../categoryIDs";
import KnowledgeBasePlugin, { Topic } from "./KnowledgeBase";
import { Trash2 } from "lucide";

const { div } = van.tags;

export class TopicLabels extends CommandCategory<Topic> {
  isediting: State<boolean> = van.state(false);
  allItems: State<Topic[]> = van.state([]);
  constructor(
    state: stateMapping<CommandPaletteState>,
    public plugin: KnowledgeBasePlugin,
  ) {
    super(state, "Your Topics", "Manage your topics and their associated verses");

    this.extras = van.derive(() => [
      {
        title: this.isediting.val ? "Stop Editing Topics" : "Edit Topics",
        description: "",
        click: () => {
          this.isediting.val = !this.isediting.val;
          this.updateViewState({ topCategory: KnowledgeBaseCategoryID });
          return false;
        },
      },
    ]);

    this.allItems = this.plugin.realTopics;
  }

  criteria = [(item: Topic) => item.title.val, (item: Topic) => item.content.val];

  renderItem(item: Topic): CommandItem {
    const verses = item.verses.val;

    return {
      title: item.title.val,
      description:
        item.content.val ||
        verses
          .slice(0, 5)
          .map(v => v.toString())
          .join(", ") + (verses.length > 5 ? `, and ${verses.length - 5} more...` : ""),
      click: () => (this.plugin.openView({ topic: item.id }), true),
      context: () => (
        (this.plugin.currentTopic.val = item),
        { topCategory: KnowledgeBaseVerseListCategoryID }
      ),
      extras: this.isediting.val
        ? div(
            {
              class: "icon-button",
              title: "Delete topic",
              onclick: (e: Event) => {
                e.stopPropagation();
                this.plugin.topics.val = this.plugin.topics.val.filter(q => q.id !== item.id);
                this.updateViewState({ topCategory: KnowledgeBaseCategoryID });
              },
            },
            renderIcon(Trash2),
          )
        : undefined,
    };
  }
}

export class VerseListCategory extends CommandCategory<VerseRef> {
  allItems: State<VerseRef[]>;
  isediting: State<boolean> = van.state(false);
  constructor(
    state: stateMapping<CommandPaletteState>,
    public plugin: KnowledgeBasePlugin,
  ) {
    super(state, "Verse List", "Manage your verse list");
    this.extras = van.derive(() => [
      {
        title: this.isediting.val ? "Stop Editing Topic" : "Edit Topic",
        description: "",
        click: () => (
          (this.isediting.val = !this.isediting.val),
          this.updateViewState({ topCategory: KnowledgeBaseVerseListCategoryID }),
          false
        ),
      },
      {
        title: `View: ${this.plugin.currentTopic.val.title.val}`,
        description: "",
        click: () => (this.plugin.openView({ topic: this.plugin.currentTopic.val.id }), true),
      },
      {
        title: "Back to Your Topics",
        description: "",
        click: () => (this.updateViewState({ topCategory: KnowledgeBaseCategoryID }), false),
      },
    ]);
    this.allItems = van.derive(() => this.plugin.currentTopic.val.verses.val);

    van.derive(() => (this.title.val = `Topic: ${this.plugin.currentTopic.val.title.val}`));
  }

  criteria = [(item: VerseRef) => item.toString()];

  renderItem(item: VerseRef): CommandItem {
    return {
      title: item.toString(),
      description: "",
      click: () => ((this.plugin.app.verseState.val = item), true),
      context: () => ((this.plugin.app.verseState.val = item), { topCategory: TSKCrossRefCategoryID }),
      extras: this.isediting.val
        ? div(
            {
              class: "icon-button",
              title: "Delete verse from topic",
              onclick: (e: Event) => {
                e.stopPropagation();
                this.plugin.currentTopic.val.verses.val = this.plugin.currentTopic.val.verses.val.filter(
                  v => !v.isSame(item),
                );
                this.updateViewState({ topCategory: KnowledgeBaseVerseListCategoryID });
              },
            },
            renderIcon(Trash2),
          )
        : undefined,
    };
  }
}
