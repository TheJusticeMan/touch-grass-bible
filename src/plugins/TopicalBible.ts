import {
  CommandCategory,
  CommandItem,
  CommandPaletteDialog,
  CommandPaletteViewState,
  MenuVan,
  State,
} from "@touchgrass/framework";
import { GitCompare } from "lucide";
import Plugin from "../core/Plugin";
import { BibleTopics, BibleTopicsType } from "../models/BibleTopics";
import { VerseRef } from "../models/VerseRef";
import { TopicListCategoryID, TSKCrossRefCategoryID } from "./categoryIDs";

export default class TopicalBiblePlugin extends Plugin {
  topics: BibleTopics = new BibleTopics({}); // Initialize with empty topics
  topic = this.app.commandPalette.useVanState(""); // State to track the currently selected topic

  async onload(): Promise<void> {
    try {
      this.topics = new BibleTopics(await this.app.files.loadJSON<BibleTopicsType>("topics.json"));
    } catch (e) {
      this.console.error("Failed to load topics.json. Topical Bible will be unavailable.", e);
    }

    this.registerPalette(dialog => new topicListCategory(dialog, this), TopicListCategoryID);

    this.addVerseAction({
      id: "topic",
      name: "View verse topics (OpenBible.info)",
      description: "View topics associated with this verse from OpenBible.info",
      icon: GitCompare,
      isAvailable: verseInfo => this.topics.getTopicsFromVerse(verseInfo.verse).length > 0,
      onTrigger: verseInfo => {
        const menu = new MenuVan();
        const topicList = this.topics.getTopicsFromVerse(verseInfo.verse);
        topicList.forEach(topic => {
          menu.addItem({
            title: topic.toTitleCase(),
            onClick: () => {
              this.topic.val = topic;
              this.app.openCommandPalette({ topCategory: TopicListCategoryID });
            },
          });
        });
        menu.showAtMouseEvent(verseInfo.event);
      },
    });
  }
}

class topicListCategory extends CommandCategory<VerseRef | string> {
  list: string[] | VerseRef[] = [];
  name = "Topics (www.openbible.info)";
  description = "List of topics from OpenBible.info";
  topic: State<string>; // State to track the currently selected topic

  constructor(
    public dialog: CommandPaletteDialog,
    public plugin: TopicalBiblePlugin,
  ) {
    super(dialog);
    this.topic = this.plugin.topic; // Initialize the topic state
  }

  onTrigger(): void {
    const topic = this.topic.val;
    if (topic) {
      this.list = this.plugin.topics.get(topic);
      this.title = `Topic: ${topic.toTitleCase()}`;
      this.defaultCMD.addCMD(
        "Clear topic filter",
        "",
        item =>
          void item.onClick(() => {
            this.topic.val = "";
            this.dialog.palette.display();
          }),
      );
    } else {
      this.list = this.plugin.topics.keys;
    }
  }

  getCommands(query: string): (VerseRef | string)[] {
    if (this.list.length > 0 && typeof this.list[0] === "string") {
      if (!query) return [];
      return this.getcompatible(query, this.list as string[], topic => topic);
    } else {
      return this.getcompatible(
        query,
        this.list as VerseRef[],
        verse => verse.toString(),
        verse => verse.vTXT,
      );
    }
  }

  renderCommand(
    command: VerseRef | string,
    Item: CommandItem<VerseRef | string>,
  ): Partial<CommandPaletteViewState> | (() => Partial<CommandPaletteViewState>) {
    if (typeof command === "string") {
      Item.setTitle(command.toTitleCase()).addctx();
      return () => {
        this.topic.val = command;
        return { topCategory: TopicListCategoryID };
      };
    } else {
      Item.setTitle(command.toString()).setDescription(command.vTXT).addctx();
      return () => {
        this.plugin.app.verseState.val = command;
        return { topCategory: TSKCrossRefCategoryID };
      };
    }
  }

  executeCommand(command: VerseRef | string): void {
    if (typeof command === "string") this.dialog.palette.display();
    else this.dialog.palette.close();
  }
}
