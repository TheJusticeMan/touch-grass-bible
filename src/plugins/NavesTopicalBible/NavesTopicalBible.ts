import {
  CommandCategory,
  CommandItem,
  CommandPaletteDialog,
  CommandPaletteViewState,
  MenuVan,
} from "@touchgrass/framework";
import { GitCompare } from "lucide";
import { VerseRef } from "src/models/VerseRef";
import Plugin from "../../core/Plugin";
import { NavesTopicListCategoryID, TSKCrossRefCategoryID } from "../categoryIDs";
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
  selectedTopicId = this.app.commandPalette.useVanState("");
  focusedTopicIds = this.app.commandPalette.useVanState<string[]>([]);

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

    this.registerPalette(dialog => new NavesTopicCategory(dialog, this), NavesTopicListCategoryID);

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
    this.app.openCommandPalette({
      topCategory: NavesTopicListCategoryID,
    });
  }

  openTopicsForVerse(verse: VerseRef): void {
    this.selectedTopicId.val = "";
    this.focusedTopicIds.val = this.topicsForVerse(verse).map(topic => topic.id);
    this.app.openCommandPalette({
      topCategory: NavesTopicListCategoryID,
    });
  }
}

class NavesTopicCategory extends CommandCategory<NaveCommand> {
  readonly name = "Nave's Topical Bible";
  readonly description = "Browse Nave's Topical Bible topics, subtopics, and verses";
  commands: NaveCommand[] = [];

  constructor(
    public dialog: CommandPaletteDialog,
    public plugin: NavesTopicalBiblePlugin,
  ) {
    super(dialog);
  }

  onTrigger(): void {
    const selectedTopicId = this.plugin.selectedTopicId.val;
    const focusedTopicIds = this.plugin.focusedTopicIds.val;
    const selectedTopic = selectedTopicId ? this.plugin.topicById(selectedTopicId) : undefined;

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

      this.title = formatTopicPath(selectedTopic.path);
      this.defaultCMD.addCMD(
        "Browse all Nave topics",
        "",
        item =>
          void item.onClick(() => {
            this.plugin.selectedTopicId.val = "";
            this.plugin.focusedTopicIds.val = [];
            this.dialog.palette.display({ topCategory: NavesTopicListCategoryID });
          }),
      );

      if (selectedTopic.parentId) {
        this.defaultCMD.addCMD(
          "Go to parent topic",
          "",
          item =>
            void item.onClick(() => {
              this.plugin.selectedTopicId.val = selectedTopic.parentId ?? "";
              this.dialog.palette.display({ topCategory: NavesTopicListCategoryID });
            }),
        );
      }

      this.commands = [
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

      return;
    }

    if (focusedTopicIds.length > 0) {
      const verse = this.plugin.app.verseState.val;
      this.title = `Nave topics for ${verse.toString()}`;
      this.defaultCMD.addCMD(
        "Browse all Nave topics",
        "",
        item =>
          void item.onClick(() => {
            this.plugin.focusedTopicIds.val = [];
            this.dialog.palette.display({ topCategory: NavesTopicListCategoryID });
          }),
      );

      this.commands = focusedTopicIds
        .map(topicId => this.plugin.topicById(topicId))
        .filter((topic): topic is NaveTopicNode => topic !== undefined)
        .map(topic => ({
          kind: "topic" as const,
          topic,
          description: formatTopicDescription(topic, "Matches this verse"),
        }));
      return;
    }

    this.title = this.name;
    this.commands = this.plugin.index.rootIds
      .map(topicId => this.plugin.topicById(topicId))
      .filter((topic): topic is NaveTopicNode => topic !== undefined)
      .map(topic => ({
        kind: "topic" as const,
        topic,
        description: formatTopicDescription(topic),
      }));
  }

  getCommands(query: string): NaveCommand[] {
    if (!query && !this.plugin.selectedTopicId.val && this.plugin.focusedTopicIds.val.length === 0) return [];
    const selectedTopicId = this.plugin.selectedTopicId.val;
    const sourceCommands =
      !query && !selectedTopicId
        ? this.commands
        : selectedTopicId || this.plugin.focusedTopicIds.val.length > 0
          ? this.commands
          : this.plugin.index.nodes.map(topic => ({
              kind: "topic" as const,
              topic,
              description: formatTopicDescription(topic),
            }));

    return this.getcompatible(
      query,
      sourceCommands,
      command => this.commandLabel(command),
      command => this.commandDescription(command),
    );
  }

  renderCommand(
    command: NaveCommand,
    Item: CommandItem<NaveCommand>,
  ): Partial<CommandPaletteViewState> | (() => Partial<CommandPaletteViewState>) {
    if (command.kind === "topic") {
      Item.setTitle(formatTopicPath(command.topic.path)).setDescription(command.description).addctx();

      return () => {
        this.plugin.selectedTopicId.val = this.plugin.getAutoExpandedTopicId(command.topic.id);
        this.plugin.focusedTopicIds.val = [];
        return { topCategory: NavesTopicListCategoryID };
      };
    }

    Item.setTitle(command.verse.toString())
      .setDescription(`${command.reference} · ${command.verse.vTXT}`)
      .addctx();

    return () => {
      this.plugin.app.verseState.val = command.verse;
      return { topCategory: TSKCrossRefCategoryID };
    };
  }

  executeCommand(command: NaveCommand): void {
    if (command.kind === "topic") this.dialog.palette.display();
    else this.dialog.palette.close();
  }

  private commandLabel(command: NaveCommand): string {
    return command.kind === "topic" ? formatTopicPath(command.topic.path) : command.reference;
  }

  private commandDescription(command: NaveCommand): string {
    return command.kind === "topic" ? command.description : command.verse.toString();
  }
}
