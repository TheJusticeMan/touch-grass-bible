import { CMDCategory, CommandItem, CommandPaletteState } from "./CommandPalette";
import { ETarget } from "./Event";

// Define base event types
interface CMDEvents extends Record<string, unknown> {
  _click: CMD;
  // Additional events can be defined in subclasses
}

// Generic base class with event type parameter
export class CMD<Events extends CMDEvents = CMDEvents> extends ETarget<Events> {
  name: string = "";
  description: string = "";
  item: CommandItem<CMD> | null = null;
  newState: Partial<CommandPaletteState> = {};

  constructor(Category: CMDCategory) {
    super();
    Category.addCMD(this as CMD);
  }

  render(_command: CMD, el: CommandItem<CMD>): Partial<CommandPaletteState> {
    this.item = el;
    this.updateItem();
    return this.newState;
  }

  click(command: CMD): void {
    this.emit("_click", command);
  }

  setName(name: string) {
    this.name = name;
    this.updateItem();
    return this;
  }

  setDescription(description: string) {
    this.description = description;
    this.updateItem();
    return this;
  }

  updateItem() {
    if (this.item) {
      this.item.setTitle(this.name).setDescription(this.description);
      this.item.removeComponents();
    }
    return this;
  }
}

abstract class SettingCMD<T> extends CMD<{ change: T } & CMDEvents> {
  value: T;

  constructor(Category: CMDCategory, initialValue: T) {
    super(Category);
    this.value = initialValue;
  }

  setValue(value: T) {
    if (this.value === value) return this;
    this.value = value;
    this.updateItem();
    this.emit("change", value);

    return this;
  }

  updateItem() {
    if (this.item) {
      this.item.setTitle(this.name).setDescription(this.description);
      this.item.removeComponents();
      this._onUpdate(this.item!);
    }
    return this;
  }

  protected abstract _onUpdate(item: CommandItem<CMD>): void;
}

// Additional events can be defined in subclasses
export class toggleCMD extends SettingCMD<boolean> {
  constructor(Category: CMDCategory, initialValue: boolean = false) {
    super(Category, initialValue);
    this.on("_click", () => this.setValue(!this.value));
  }

  protected _onUpdate(item: CommandItem<CMD>): void {
    item.addToggleInput(toggle => toggle.setValue(this.value).on("change", v => this.setValue(v)));
  }
}

export class textCMD extends SettingCMD<string> {
  constructor(Category: CMDCategory, initialValue: string = "") {
    super(Category, initialValue);
    this.on("_click", () => {
      const newValue = prompt("Enter new value:", this.value);
      if (newValue !== null) {
        this.setValue(newValue);
      }
    });
  }

  protected _onUpdate(item: CommandItem<CMD>): void {
    item.addTextInput(input => input.setValue(this.value).on("change", v => this.setValue(v)));
  }
}

export class sliderCMD extends SettingCMD<number> {
  constructor(Category: CMDCategory, initialValue: number = 0) {
    super(Category, initialValue);
  }

  protected _onUpdate(item: CommandItem<CMD>): void {
    item.addSliderInput(slider => slider.setValue(this.value).on("change", v => this.setValue(v)));
  }
}

abstract class CMD2Type<T> {
  abstract name: string;
  abstract description: string;
  abstract render: (
    command: T,
    el: CommandItem<T>,
  ) => Partial<CommandPaletteState> | ((state: CommandPaletteState) => CommandPaletteState);
}

export function CMD2<T>(
  name: string,
  description: string,
  cb: (
    cmd: CommandItem<T>,
  ) => Partial<CommandPaletteState> | ((state: CommandPaletteState) => CommandPaletteState),
): CMD2Type<T> {
  return new (class extends CMD2Type<T> {
    name = name;
    description = description;
    render = (
      _command: T,
      el: CommandItem<T>,
    ): Partial<CommandPaletteState> | ((state: CommandPaletteState) => CommandPaletteState) => {
      el.setTitle(this.name).setDescription(this.description);
      return cb(el);
    };
  })();
}
