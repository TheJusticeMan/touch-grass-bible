import {
  CategoryLoader,
  Command,
  CommandCategory,
  CommandItem,
  CommandPaletteDialog,
  CommandPaletteViewState,
  GestureCommand,
  GestureHandler,
  Offset,
  renderIcon,
  van,
} from "@touchgrass/framework";
import { Terminal } from "lucide";
import Plugin from "src/core/Plugin";
import { GestureAddCommandsCategoryID } from "../categoryIDs";
import "./GestureCommands.css";

const { button } = van.tags;

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
    const el = button(
      { class: "gesture-button", onclick: () => this.app.openCommandPalette({}) },
      renderIcon(Terminal),
    );

    van.add(this.app.contentEl, el);
    new GestureHandler(
      el,
      this.settings.commandGestures,
      line => {
        this.lastLine = line;
        this.app.commandPalette.opencategory(GestureAddCommandsCategoryID);
      },
      ({ id }) => this.app.commandPalette.commands.executeCommand(id),
    );

    this.registerHiddenPalette(dialog => new AddGesture(dialog, this), GestureAddCommandsCategoryID);
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
    public dialog: CommandPaletteDialog,
    public plugin: GesturePlugin,
  ) {
    super(dialog);
  }

  onTrigger(state: CommandPaletteViewState): void {
    void state;
    // No category-level action
  }

  getCommands(query: string): Command[] {
    return this.dialog.palette.commands.commands.filter(cmd =>
      cmd.name.toLowerCase().includes(query.toLowerCase()),
    );
  }

  renderCommand(
    command: Command,
    el: CommandItem<Command>,
  ): Partial<CommandPaletteViewState> | (() => Partial<CommandPaletteViewState>) {
    el.setTitle(`Add Gesture for: ${command.name}`);
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
    this.dialog.palette.close();
  }
}
