import { GitCompare } from "lucide";
import {
  Button,
  CommandCategory,
  CommandItem,
  CommandPaletteState,
  UnifiedCommandPalette,
} from "@touchgrass/framework";
import { VerseRef } from "src/models/VerseRef";
import { VerseInfoComponent } from "src/ui/VerseScreen";
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

    this.registerPalette(
      () => new NavesTopicCategory(this.app.commandPalette, this),
      NavesTopicListCategoryID,
    );

    this.addVerseAction({
      id: "naves-topic",
      name: "View verse topics (Nave's Topical Bible)",
      description: "Find Nave topics that include this verse and open them in the command palette",
      icon: GitCompare,
      onTrigger: (verseInfo: VerseInfoComponent) => {
        const matches = this.topicsForVerse(verseInfo.verse);

        if (matches.length === 0) {
          verseInfo.element.createEl("p", {
            text: "No Nave topics found for this verse.",
          });
          return;
        }

        matches.slice(0, 10).forEach(topic => {
          new Button(verseInfo.element)
            .setButtonText(formatTopicPath(topic.path))
            .on("click", () => this.openTopic(topic.id));
        });

        if (matches.length > 10) {
          new Button(verseInfo.element)
            .setButtonText(`Open all ${matches.length} Nave topics`)
            .on("click", () => this.openTopicsForVerse(verseInfo.verse));
        }
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
    this.selectedTopicId.set(this.getAutoExpandedTopicId(topicId));
    this.focusedTopicIds.set([]);
    this.app.openCommandPalette({
      topCategory: NavesTopicListCategoryID,
    });
  }

  openTopicsForVerse(verse: VerseRef): void {
    this.selectedTopicId.set("");
    this.focusedTopicIds.set(this.topicsForVerse(verse).map(topic => topic.id));
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
    public commandPalette: UnifiedCommandPalette,
    public plugin: NavesTopicalBiblePlugin,
  ) {
    super(commandPalette);
  }

  onTrigger(): void {
    const selectedTopicId = this.plugin.selectedTopicId.get();
    const focusedTopicIds = this.plugin.focusedTopicIds.get();
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
          void item.on("click", () => {
            this.plugin.selectedTopicId.set("");
            this.plugin.focusedTopicIds.set([]);
            this.commandPalette.display({ topCategory: NavesTopicListCategoryID });
          }),
      );

      if (selectedTopic.parentId) {
        this.defaultCMD.addCMD(
          "Go to parent topic",
          "",
          item =>
            void item.on("click", () => {
              this.plugin.selectedTopicId.set(selectedTopic.parentId ?? "");
              this.commandPalette.display({ topCategory: NavesTopicListCategoryID });
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
      const verse = this.plugin.app.verseState.get();
      this.title = `Nave topics for ${verse.toString()}`;
      this.defaultCMD.addCMD(
        "Browse all Nave topics",
        "",
        item =>
          void item.on("click", () => {
            this.plugin.focusedTopicIds.set([]);
            this.commandPalette.display({ topCategory: NavesTopicListCategoryID });
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
    if (!query && !this.plugin.selectedTopicId.get() && this.plugin.focusedTopicIds.get().length === 0)
      return [];
    const selectedTopicId = this.plugin.selectedTopicId.get();
    const sourceCommands =
      !query && !selectedTopicId
        ? this.commands
        : selectedTopicId || this.plugin.focusedTopicIds.get().length > 0
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
  ): (state: CommandPaletteState) => CommandPaletteState {
    if (command.kind === "topic") {
      Item.setTitle(formatTopicPath(command.topic.path)).setDescription(command.description).addctx();

      return state => {
        this.plugin.selectedTopicId.set(this.plugin.getAutoExpandedTopicId(command.topic.id));
        this.plugin.focusedTopicIds.set([]);
        return state.update({ topCategory: NavesTopicListCategoryID });
      };
    }

    Item.setTitle(command.verse.toString())
      .setDescription(`${command.reference} · ${command.verse.vTXT}`)
      .addctx();

    return state => {
      this.plugin.app.verseState.set(command.verse);
      return state.update({ topCategory: TSKCrossRefCategoryID });
    };
  }

  executeCommand(command: NaveCommand): void {
    if (command.kind === "topic") this.commandPalette.display();
    else this.commandPalette.close();
  }

  private commandLabel(command: NaveCommand): string {
    return command.kind === "topic" ? formatTopicPath(command.topic.path) : command.reference;
  }

  private commandDescription(command: NaveCommand): string {
    return command.kind === "topic" ? command.description : command.verse.toString();
  }
}
