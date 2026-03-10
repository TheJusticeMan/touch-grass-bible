import { GitCompare } from "lucide";
import { BibleTopics, BibleTopicsType } from "../BibleTopics";
import {
  Button,
  CMD,
  CommandCategory,
  CommandItem,
  CommandPaletteState,
  UnifiedCommandPalette,
  VerseInfoComponent,
} from "../main";
import Plugin from "../Plugin";
import { VerseRef } from "../VerseRef";
import { TSKCrossRefCategoryID } from "./TSK";
import { PaletteState } from "../external/PaletteStateController";

const TopicListCategoryID = "topics";

export default class TopicalBiblePlugin extends Plugin {
  topics: BibleTopics = new BibleTopics({}); // Initialize with empty topics
  topic = this.app.commandPalette.useState(""); // State to track the currently selected topic

  async onload(): Promise<void> {
    try {
      this.topics = new BibleTopics(await this.app.loadJSON<BibleTopicsType>("topics.json"));
    } catch (e) {
      this.console.error("Failed to load topics.json. Topical Bible will be unavailable.", e);
    }

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
            this.topic.set(topic);
            this.app.openCommandPalette({
              topCategory: TopicListCategoryID,
            });
          });
        });
      },
    });
  }
}

class topicListCategory extends CommandCategory<VerseRef | string> {
  list: string[] | VerseRef[] = [];
  name = "Topics (www.openbible.info)";
  description = "List of topics from OpenBible.info";
  topic: PaletteState<string>; // State to track the currently selected topic

  constructor(
    public commandPalette: UnifiedCommandPalette,
    public plugin: TopicalBiblePlugin,
  ) {
    super(commandPalette);
    this.topic = this.plugin.topic; // Initialize the topic state
  }

  onTrigger(): void {
    const topic = this.topic.get();
    if (topic) {
      this.list = this.plugin.topics.get(topic);
      this.title = `Topic: ${topic.toTitleCase()}`;
      new CMD(this.defaultCMD).setName("Clear topic filter").on("_click", () => {
        this.topic.set("");
        this.commandPalette.display();
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

  renderCommand(
    command: VerseRef | string,
    Item: CommandItem<VerseRef | string>,
  ): (state: CommandPaletteState) => CommandPaletteState {
    if (typeof command === "string") {
      Item.setTitle(command.toTitleCase()).addctx();
      return state => {
        this.topic.set(command);
        return state.update({ ...state, topCategory: TopicListCategoryID });
      };
    } else {
      Item.setTitle(command.toString()).setDescription(command.vTXT).addctx();
      return state => {
        this.plugin.app.verseState.set(command);
        return state.update({ ...state, topCategory: TSKCrossRefCategoryID });
      };
    }
  }

  executeCommand(command: VerseRef | string): void {
    if (typeof command === "string") this.commandPalette.display();
    else this.commandPalette.close();
  }
}
