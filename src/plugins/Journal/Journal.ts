import {
  CommandCategory,
  CommandItem,
  CommandPaletteState,
  UnifiedCommandPalette,
  VerseRef,
} from "../../main";
import Plugin from "../../Plugin";
import { JournalPanel } from "./JournalPanel";
import { JournalStorage } from "./journal-storage";

const JournalCategoryID = "journal";
const JournalViewID = "journal-panel";

type JournalSettings = {
  appendOnly: boolean;
};

const defaultJournalSettings: JournalSettings = {
  appendOnly: false,
};

export default class JournalPlugin extends Plugin {
  settings: JournalSettings = defaultJournalSettings;
  storage: JournalStorage = new JournalStorage(this.app);
  private panelInstances = new Set<JournalPanel>();
  private lastVerseLog = "";

  async onload(): Promise<void> {
    this.settings = await this.loadSettings(defaultJournalSettings);

    this.registerView(JournalViewID, panel => {
      const view = new JournalPanel(panel, this);
      this.panelInstances.add(view);
      view.on("detach", () => {
        this.panelInstances.delete(view);
      });
      return view;
    });

    this.registerPalette(() => new JournalCategory(this.app.commandPalette, this), JournalCategoryID);

    this.app.verseState.onChange(verse => {
      void this.handleVerseChange(verse);
    });
  }

  async saveSettings() {
    await super.saveSettings(this.settings);
  }

  openJournal(): void {
    const activated = this.app.workspace.activateView(JournalViewID);
    if (!activated) {
      const activePanel = this.app.workspace.activePanel;
      const targetPanel =
        activePanel?.getMode() === "views"
          ? activePanel
          : (this.app.workspace.rootPanel.childPanels.at(-1)?.panel ?? null);
      if (targetPanel) {
        this.app.workspace.openView(JournalViewID, targetPanel, {
          title: "Journal",
          activate: true,
        });
      }
    }
  }

  private async handleVerseChange(verse: VerseRef): Promise<void> {
    const verseLabel = verse.toString();
    if (verseLabel === this.lastVerseLog) {
      return;
    }
    this.lastVerseLog = verseLabel;

    const entry = await this.storage.appendVerseRef(verse);
    const dayKey = this.storage.todayKey();
    this.panelInstances.forEach(panel => {
      void panel.addLiveEntry(entry, dayKey);
    });
  }
}

class JournalCategory extends CommandCategory<string> {
  readonly name = "Journal";
  readonly description = "Open your day-by-day journal with reading history";

  constructor(
    public commandPalette: UnifiedCommandPalette,
    private plugin: JournalPlugin,
  ) {
    super(commandPalette);
  }

  onTrigger(_state: CommandPaletteState): void {
    // no-op
  }

  getCommands(query: string): string[] {
    const commands = ["Open Journal"];
    if (!query) {
      return commands;
    }
    return this.getcompatible(query, commands, command => command);
  }

  renderCommand(
    command: string,
    item: CommandItem<string>,
  ): (state: CommandPaletteState) => CommandPaletteState {
    item
      .setTitle(command)
      .setDescription("Continue writing from the bottom and scroll up for older days")
      .addctx();

    return state => {
      this.plugin.openJournal();
      return state;
    };
  }

  executeCommand(): void {
    this.commandPalette.close();
  }
}
