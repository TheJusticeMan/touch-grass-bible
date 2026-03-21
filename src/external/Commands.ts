import { IconNode } from "lucide";

export type Command = {
  name: string;
  id: string;
  description: string;
  icon: IconNode;
  callback?: () => void;
  checkCallback?: (checking: boolean) => boolean | void;
};

export class Commands {
  executeCommand(id: string) {
    const command = this._commands.get(id);
    if (command) {
      if (command.checkCallback) void (command.checkCallback(true) && command.checkCallback(false));
      else command.callback?.();
    } else {
      console.warn(`Command with id "${id}" not found.`);
    }
  }
  private _commands: Map<string, Command>;

  constructor() {
    this._commands = new Map();
  }

  addCommand(command: Command) {
    if (this._commands.has(command.id)) {
      console.warn(`Command with id "${command.id}" already exists. It will be overwritten.`);
    }
    this._commands.set(command.id, command);
  }

  removeCommand(id: string) {
    this._commands.delete(id);
  }

  getCommand(id: string): Command | undefined {
    return this._commands.get(id);
  }

  get commands(): Command[] {
    return Array.from(this._commands.values());
  }
}
