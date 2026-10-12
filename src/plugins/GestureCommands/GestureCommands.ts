import {
  Command,
  CommandCategory,
  CommandItem,
  CommandPaletteState,
  GestureCommand,
  GestureHandler,
  Offset,
  renderIcon,
  stateMapping,
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
      { class: "gesture-button", onclick: () => this.app.commandPalette.open({ topCategory: "" }) },
      renderIcon(Terminal),
    );

    van.add(this.app.contentEl, el);
    new GestureHandler(
      el,
      this.settings.commandGestures,
      line => {
        this.lastLine = line;
        this.app.commandPalette.open({ topCategory: GestureAddCommandsCategoryID });
      },
      ({ id }) => {
        const matched = this.settings.commandGestures.find(gesture => gesture.id === id);
        if (!matched) {
          this.app.console.warn(`Gesture command with id "${id}" not found.`);
        }
      },
    );

    this.registerPalette(GestureAddCommandsCategoryID, ({ state }) => new AddGesture(state, this), true);
  }

  saveGestures() {
    this.saveSettings(this.settings);
  }
}

class AddGesture extends CommandCategory<Command> {
  allItems = this.plugin.app.commandPalette.commands.commands;
  criteria: Array<(item: Command) => string> = [
    command => command.name,
    command => command.description,
    command => command.id,
  ];

  constructor(
    state: stateMapping<CommandPaletteState>,
    public plugin: GesturePlugin,
  ) {
    super(state, "Add Gesture", "Add a new gesture command");
    this.extras = van.derive(() => {
      if (this.plugin.lastLine.length === 0) {
        return [{ title: "No gesture captured", description: "Draw a gesture over the button first." }];
      }
      return [];
    });
  }

  renderItem(command: Command): CommandItem {
    return {
      title: `Add Gesture for: ${command.name}`,
      description: command.description,
      click: () => {
        this.plugin.settings.commandGestures.push({
          id: command.id,
          name: command.name,
          gesturePath: JSON.stringify(
            this.plugin.lastLine.map(p => [Number(p.x.toFixed(2)), Number(p.y.toFixed(2))]),
          ),
        });
        this.plugin.saveGestures();
        return true;
      },
    };
  }
}
