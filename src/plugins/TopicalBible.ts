import { CommandCategory, CommandPaletteState, MenuVan, stateMapping, van } from "@touchgrass/framework";
import { GitCompare } from "lucide";
import Plugin from "../core/Plugin";
import { BibleTopics, BibleTopicsType } from "../models/BibleTopics";
import { VerseRef } from "../models/VerseRef";
import { TopicListCategoryID, TSKCrossRefCategoryID } from "./categoryIDs";

export default class TopicalBiblePlugin extends Plugin {
  topics: BibleTopics = new BibleTopics({});
  topic = this.app.commandPalette.useState("");

  async onload(): Promise<void> {
    try {
      this.topics = new BibleTopics(await this.app.files.loadJSON<BibleTopicsType>("topics.json"));
    } catch (e) {
      this.console.error("Failed to load topics.json. Topical Bible will be unavailable.", e);
    }

    this.registerPalette(TopicListCategoryID, ({ state }) => new topicListCategory(state, this));

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
              this.app.commandPalette.open({ topCategory: TopicListCategoryID });
            },
          });
        });
        menu.showAtMouseEvent(verseInfo.event);
      },
    });
  }
}

class topicListCategory extends CommandCategory<VerseRef | string> {
  allItems = van.state<(VerseRef | string)[]>([]);
  criteria: Array<(item: VerseRef | string) => string> = [
    item => (typeof item === "string" ? item : item.toString()),
    item => (typeof item === "string" ? item : item.vTXT),
  ];

  constructor(
    state: stateMapping<CommandPaletteState>,
    public plugin: TopicalBiblePlugin,
  ) {
    super(state, "Topics (www.openbible.info)", "List of topics from OpenBible.info");
    this.deriveExtraCMDs(() => {
      const topic = this.plugin.topic.val;
      if (!topic) return [];

      return [
        {
          title: "Clear topic filter",
          description: "",
          cb: () => ({
            click: () => {
              this.plugin.topic.val = "";
              this.updateViewState({ topCategory: TopicListCategoryID });
              return false;
            },
          }),
        },
      ];
    });

    this.allItems = van.derive(() => {
      const topic = this.plugin.topic.val;
      const query = this.state.query.val.trim();

      if (topic) {
        this.title.val = `Topic: ${topic.toTitleCase()}`;
        return this.plugin.topics.get(topic);
      }

      this.title.val = "Topics (www.openbible.info)";
      if (!query) return [];
      return this.plugin.topics.keys;
    });
  }

  renderItem(command: VerseRef | string) {
    if (typeof command === "string") {
      const openTopic = this.context(() => {
        this.plugin.topic.val = command;
        return { topCategory: TopicListCategoryID };
      });

      return {
        title: command.toTitleCase(),
        description: "Open this topic",
        ...openTopic,
        click: openTopic.context,
      };
    }

    const openCrossRef = this.context(() => {
      this.plugin.app.verseState.val = command;
      return { topCategory: TSKCrossRefCategoryID };
    });

    return {
      title: command.toString(),
      description: command.vTXT,
      ...openCrossRef,
      click: openCrossRef.context,
    };
  }

  executeCommand(): void {
    return;
  }
}
