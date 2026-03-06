import { GitCompare } from "lucide";
import { BibleTopics, BibleTopicsType } from "../BibleTopics";
import {
  Button,
  CMD,
  CommandCategory,
  CommandItem,
  UnifiedCommandPalette,
  VerseInfoComponent,
} from "../main";
import Plugin from "../Plugin";
import { TGPaletteState } from "../TGPaletteCategories";
import { VerseRef } from "../VerseRef";
import { TSKCrossRefCategoryID } from "./TSK";

export const TopicListCategoryID = "topics";

export default class TopicalBiblePlugin extends Plugin {
  topics: BibleTopics = new BibleTopics({}); // Initialize with empty topics

  async onload(): Promise<void> {
    this.topics = new BibleTopics(await this.app.loadJSON<BibleTopicsType>("topics.json"));

    this.registerPalette(() => new topicListCategory(this.app.commandPalette, this), TopicListCategoryID);

    this.addVerseAction({
      id: "topic",
      name: "View verse topics (OpenBible.info)",
      description: "View topics associated with this verse from OpenBible.info",
      icon: GitCompare,
      onTrigger: (verseInfo: VerseInfoComponent) => {
        const topicList = this.topics.getTopicsFromVerse(verseInfo.verse);
        topicList.forEach(topic => {
          new Button(verseInfo.element).setButtonText(`${topic.toTitleCase()}`).on("click", () => {
            this.app.openCommandPalette({
              topCategory: "topic-list",
              topic: topic,
            });
          });
        });
      },
    });
  }
}

export class topicListCategory extends CommandCategory<VerseRef | string> {
  list: string[] | VerseRef[] = [];
  name = "Topics (www.openbible.info)";
  description = "List of topics from OpenBible.info";

  constructor(
    public commandPalette: UnifiedCommandPalette,
    public plugin: TopicalBiblePlugin,
  ) {
    super(commandPalette);
  }

  onTrigger(state: TGPaletteState): void {
    if (state.topic) {
      const { topic } = state;
      this.list = this.plugin.topics.get(topic);
      this.title = `Topic: ${topic.toTitleCase()}`;
      new CMD(this.defaultCMD).setName("Clear topic filter").on("_click", () => {
        this.commandPalette.update({ topic: "" } as TGPaletteState).display();
      });
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

  renderCommand(command: VerseRef | string, Item: CommandItem<VerseRef | string>): Partial<TGPaletteState> {
    if (typeof command === "string") {
      Item.setTitle(command.toTitleCase()).addctx();
      return { topCategory: TopicListCategoryID, topic: command };
    } else {
      Item.setTitle(command.toString()).setDescription(command.vTXT).addctx();
      return { topCategory: TSKCrossRefCategoryID, verse: command };
    }
  }

  executeCommand(command: VerseRef | string): void {
    if (typeof command === "string") this.commandPalette.display();
    else this.commandPalette.close();
  }
}
