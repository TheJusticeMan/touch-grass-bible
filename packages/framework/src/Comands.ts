import { CommandItem, CommandPaletteViewState } from "./CommandPalette";

export abstract class CMDType {
  abstract name: string;
  abstract description: string;
  abstract render: (
    command: CMDType,
    el: CommandItem<CMDType>,
  ) => Partial<CommandPaletteViewState> | (() => Partial<CommandPaletteViewState>);
}

export function CMD(
  name: string,
  description: string,
  cb: (
    cmd: CommandItem<CMDType>,
  ) => Partial<CommandPaletteViewState> | (() => Partial<CommandPaletteViewState>) | void,
): CMDType {
  return new (class extends CMDType {
    name = name;
    description = description;
    render = (
      _command: CMDType,
      el: CommandItem<CMDType>,
    ): Partial<CommandPaletteViewState> | (() => Partial<CommandPaletteViewState>) => {
      el.setTitle(this.name).setDescription(this.description);
      return cb(el) || {};
    };
  })();
}
