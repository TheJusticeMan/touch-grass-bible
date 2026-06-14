import { CommandCategory, CommandPaletteState, MenuVan, stateMapping, van } from "@touchgrass/framework";
import { GitCompare } from "lucide";
import { VerseRef } from "src/models/VerseRef";
import Plugin from "../../core/Plugin";
import { NavesTopicListCategoryID } from "../categoryIDs";
import {
  buildNaveIndex,
  findTopicsForVerse,
  getChildTopics,
  getReferenceStartVerse,
  getRelatedTopics,
  type NaveIndex,
  type NaveTopic,
  type NaveTopicNode,
} from "./NavesTopicalBibleData";

type NaveCommand =
  | {
      kind: "topic";
      topic: NaveTopicNode;
      description: string;
    }
  | {
      kind: "verse";
      reference: string;
      verse: VerseRef;
    };

function formatTopicPath(path: string[]): string {
  return path.map(part => part.toTitleCase()).join(" > ");
}

function pluralize(value: number, singular: string, plural = `${singular}s`): string {
  return `${value} ${value === 1 ? singular : plural}`;
}

function formatTopicDescription(topic: NaveTopicNode, relationLabel?: string): string {
  const location =
    topic.path.length === 1 ? "Top-level topic" : `Under ${formatTopicPath(topic.path.slice(0, -1))}`;

  const counts = [
    pluralize(topic.childIds.length, "subtopic"),
    pluralize(topic.verses.length, "reference"),
    pluralize(topic.relatedTopics.length, "related topic"),
  ].join(" · ");

  return `${relationLabel ? `${relationLabel}. ` : ""}${location} · ${counts}`;
}

export default class NavesTopicalBiblePlugin extends Plugin {
  index: NaveIndex = buildNaveIndex([]);
  selectedTopicId = this.app.commandPalette.useState("");
  focusedTopicIds = this.app.commandPalette.useState<string[]>([]);

  getAutoExpandedTopicId(topicId: string): string {
    let currentTopicId = topicId;
    const visited = new Set<string>();

    while (!visited.has(currentTopicId)) {
      visited.add(currentTopicId);
      const topic = this.topicById(currentTopicId);

      if (!topic) return currentTopicId;

      const hasSingleSubtopic = topic.childIds.length === 1;
      const hasOwnContent = topic.verses.length > 0 || topic.relatedTopics.length > 0;

      if (!hasSingleSubtopic || hasOwnContent) return currentTopicId;

      currentTopicId = topic.childIds[0];
    }

    return currentTopicId;
  }

  async onload(): Promise<void> {
    try {
      const topics = await this.app.files.loadJSON<NaveTopic[]>("parsed-nave.json");
      this.index = buildNaveIndex(topics);
    } catch (e) {
      this.console.error("Failed to load parsed-nave.json. Nave's Topical Bible will be unavailable.", e);
    }

    this.registerPalette(NavesTopicListCategoryID, ({ state }) => new NavesTopicCategory(state, this));

    this.addVerseAction({
      id: "naves-topic",
      name: "View verse topics (Nave's Topical Bible)",
      description: "Find Nave topics that include this verse and open them in the command palette",
      icon: GitCompare,
      isAvailable: verseInfo => this.topicsForVerse(verseInfo.verse).length > 0,
      onTrigger: verseInfo => {
        const matches = this.topicsForVerse(verseInfo.verse);

        new MenuVan()
          .addItems([
            ...matches.slice(0, 5).map(topic => ({
              title: formatTopicPath(topic.path),
              onClick: () => this.openTopic(topic.id),
            })),
            matches.length > 5
              ? {
                  title: `Open all ${matches.length} Nave topics for this verse`,
                  onClick: () => this.openTopicsForVerse(verseInfo.verse),
                }
              : {
                  title: `Open command palette with Nave topics for this verse`,
                  onClick: () => this.openTopicsForVerse(verseInfo.verse),
                },
          ])
          .showAtMouseEvent(verseInfo.event);
      },
    });
  }

  topicById(topicId: string): NaveTopicNode | undefined {
    return this.index.nodeById.get(topicId);
  }

  topicsForVerse(verse: VerseRef): NaveTopicNode[] {
    return findTopicsForVerse(this.index, verse);
  }

  openTopic(topicId: string): void {
    this.selectedTopicId.val = this.getAutoExpandedTopicId(topicId);
    this.focusedTopicIds.val = [];
    this.app.commandPalette.open({
      topCategory: NavesTopicListCategoryID,
    });
  }

  openTopicsForVerse(verse: VerseRef): void {
    this.selectedTopicId.val = "";
    this.focusedTopicIds.val = this.topicsForVerse(verse).map(topic => topic.id);
    this.app.commandPalette.open({
      topCategory: NavesTopicListCategoryID,
    });
  }
}

class NavesTopicCategory extends CommandCategory<NaveCommand> {
  allItems = van.state<NaveCommand[]>([]);
  criteria: Array<(item: NaveCommand) => string> = [
    command => this.commandLabel(command),
    command => this.commandDescription(command),
  ];

  constructor(
    state: stateMapping<CommandPaletteState>,
    public plugin: NavesTopicalBiblePlugin,
  ) {
    super(state, "Nave's Topical Bible", "Browse Nave's Topical Bible topics, subtopics, and verses");
    this.deriveExtraCMDs(() => {
      const selectedTopicId = this.plugin.selectedTopicId.val;
      const focusedTopicIds = this.plugin.focusedTopicIds.val;
      const selectedTopic = selectedTopicId ? this.plugin.topicById(selectedTopicId) : undefined;

      if (selectedTopic) {
        const items = [
          {
            title: "Browse all Nave topics",
            description: "",
            cb: () => ({
              click: () => {
                this.plugin.selectedTopicId.val = "";
                this.plugin.focusedTopicIds.val = [];
                this.updateViewState({ topCategory: NavesTopicListCategoryID });
                return false;
              },
            }),
          },
        ];

        if (selectedTopic.parentId) {
          items.push({
            title: "Go to parent topic",
            description: "",
            cb: () => ({
              click: () => {
                this.plugin.selectedTopicId.val = selectedTopic.parentId ?? "";
                this.updateViewState({ topCategory: NavesTopicListCategoryID });
                return false;
              },
            }),
          });
        }

        return items;
      }

      if (focusedTopicIds.length > 0) {
        return [
          {
            title: "Browse all Nave topics",
            description: "",
            cb: () => ({
              click: () => {
                this.plugin.focusedTopicIds.val = [];
                this.updateViewState({ topCategory: NavesTopicListCategoryID });
                return false;
              },
            }),
          },
        ];
      }

      return [];
    });

    this.allItems = van.derive(() => {
      const selectedTopicId = this.plugin.selectedTopicId.val;
      const focusedTopicIds = this.plugin.focusedTopicIds.val;
      const selectedTopic = selectedTopicId ? this.plugin.topicById(selectedTopicId) : undefined;
      const query = this.state.query.val.trim();

      if (selectedTopic) {
        const verseCommands = selectedTopic.verses
          .map(reference => {
            const verse = getReferenceStartVerse(reference);
            return verse
              ? {
                  kind: "verse" as const,
                  reference,
                  verse,
                }
              : null;
          })
          .filter(
            (
              command,
            ): command is {
              kind: "verse";
              reference: string;
              verse: VerseRef;
            } => command !== null,
          );

        this.title.val = formatTopicPath(selectedTopic.path);
        return [
          ...getChildTopics(this.plugin.index, selectedTopic).map(topic => ({
            kind: "topic" as const,
            topic,
            description: formatTopicDescription(topic, "Subtopic"),
          })),
          ...getRelatedTopics(this.plugin.index, selectedTopic).map(topic => ({
            kind: "topic" as const,
            topic,
            description: formatTopicDescription(topic, "Related topic"),
          })),
          ...verseCommands,
        ];
      }

      if (focusedTopicIds.length > 0) {
        const verse = this.plugin.app.verseState.val;
        this.title.val = `Nave topics for ${verse.toString()}`;

        return focusedTopicIds
          .map(topicId => this.plugin.topicById(topicId))
          .filter((topic): topic is NaveTopicNode => topic !== undefined)
          .map(topic => ({
            kind: "topic" as const,
            topic,
            description: formatTopicDescription(topic, "Matches this verse"),
          }));
      }

      this.title.val = "Nave's Topical Bible";
      if (!query) return [];

      return this.plugin.index.nodes.map(topic => ({
        kind: "topic" as const,
        topic,
        description: formatTopicDescription(topic),
      }));
    });
  }

  renderItem(command: NaveCommand) {
    if (command.kind === "topic") {
      const openTopic = this.context(() => {
        this.plugin.selectedTopicId.val = this.plugin.getAutoExpandedTopicId(command.topic.id);
        this.plugin.focusedTopicIds.val = [];
        return { topCategory: NavesTopicListCategoryID };
      });

      return {
        title: formatTopicPath(command.topic.path),
        description: command.description,
        ...openTopic,
        click: openTopic.context,
      };
    }

    return {
      title: command.verse.toString(),
      description: `${command.reference} · ${command.verse.vTXT}`,
      click: () => ((this.plugin.app.verseState.val = command.verse), true),
    };
  }

  private commandLabel(command: NaveCommand): string {
    return command.kind === "topic" ? formatTopicPath(command.topic.path) : command.reference;
  }

  private commandDescription(command: NaveCommand): string {
    return command.kind === "topic" ? command.description : command.verse.toString();
  }
}
