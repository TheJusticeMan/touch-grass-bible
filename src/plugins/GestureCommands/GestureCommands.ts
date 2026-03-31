import { Terminal } from "lucide";
import Plugin from "src/core/Plugin";
import {
  Button,
  CategoryLoader,
  Command,
  CommandCategory,
  CommandItem,
  CommandPaletteState,
  Offset,
  UnifiedCommandPalette,
} from "src/external";
import "src/plugins/GestureCommands/GestureCommands.css";
import { GestureAddCommandsCategoryID } from "../categoryIDs";
import { GestureCommand, GestureHandler } from "./gesture-handler";

type GestureCommandsSettings = {
  commandGestures: GestureCommand[];
};

const defaultSettings: GestureCommandsSettings = {
  commandGestures: [],
};

export default class GesturePlugin extends Plugin {
  settings: GestureCommandsSettings = defaultSettings;
  lastLine: Offset[] = [];
  async onload(): Promise<void> {
    this.settings = await this.loadSettings(defaultSettings);
    const el = new Button(this.app.contentEl)
      .addClass("gesture-button")
      .setIcon(Terminal)
      .on("click", () => this.app.openCommandPalette({}));

    new GestureHandler(
      el.element,
      this.settings.commandGestures,
      line => {
        this.lastLine = line;
        this.app.commandPalette.opencategory(GestureAddCommandsCategoryID);
      },
      ({ id }) => this.app.commandPalette.commands.executeCommand(id),
    );

    this.registerHiddenPalette(
      () => new AddGesture(this.app.commandPalette, this),
      GestureAddCommandsCategoryID,
    );
  }

  saveGestures() {
    this.saveSettings(this.settings);
  }
}

class AddGesture extends CommandCategory<Command> {
  id = GestureAddCommandsCategoryID;
  name = "Add Gesture";
  description = "Add a new gesture command";
  icon = Terminal;
  siblings: CategoryLoader<unknown>[] = [];
  constructor(
    public commandPalette: UnifiedCommandPalette,
    public plugin: GesturePlugin,
  ) {
    super(commandPalette);
  }

  onTrigger(state: CommandPaletteState): void {
    void state;
    // No category-level action
  }

  getCommands(query: string): Command[] {
    return this.commandPalette.commands.commands.filter(cmd =>
      cmd.name.toLowerCase().includes(query.toLowerCase()),
    );
  }

  renderCommand(
    command: Command,
    el: CommandItem<Command>,
  ): Partial<CommandPaletteState> | ((state: CommandPaletteState) => CommandPaletteState) {
    el.setName("Add Gesture for: " + command.name);
    return {};
  }

  executeCommand(command: Command): void {
    this.plugin.settings.commandGestures.push({
      id: command.id,
      name: command.name,
      gesturePath: JSON.stringify(
        this.plugin.lastLine.map(p => [Number(p.x.toFixed(2)), Number(p.y.toFixed(2))]),
      ),
    });
    this.plugin.saveGestures();
    this.commandPalette.close();
  }
}
