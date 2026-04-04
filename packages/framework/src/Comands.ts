import { CommandItem, CommandPaletteState } from "./CommandPalette";

export abstract class CMDType {
  abstract name: string;
  abstract description: string;
  abstract render: (
    command: CMDType,
    el: CommandItem<CMDType>,
  ) => Partial<CommandPaletteState> | ((state: CommandPaletteState) => CommandPaletteState);
}

export function CMD(
  name: string,
  description: string,
  cb: (
    cmd: CommandItem<CMDType>,
  ) => Partial<CommandPaletteState> | ((state: CommandPaletteState) => CommandPaletteState) | void,
): CMDType {
  return new (class extends CMDType {
    name = name;
    description = description;
    render = (
      _command: CMDType,
      el: CommandItem<CMDType>,
    ): Partial<CommandPaletteState> | ((state: CommandPaletteState) => CommandPaletteState) => {
      el.setTitle(this.name).setDescription(this.description);
      return cb(el) || {};
    };
  })();
}
