import { CheckSquare, Square } from "lucide";
import { CMDCategory, CommandItem, CommandPaletteState, ETarget } from "./App";

// Define base event types
interface CMDEvents {
  _click: CMD;
  // Additional events can be defined in subclasses
}

// Generic base class with event type parameter
export class CMD<Events extends CMDEvents = CMDEvents> extends ETarget<Events> {
  name: string = "";
  description: string = "";
  item: CommandItem<CMD> | null = null;
  newState: Partial<CommandPaletteState> = {};

  constructor(Category: CMDCategory<any>) {
    super();
    Category.addCMD(this);
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
      this._onUpdate(this.item);
    }
    return this;
  }

  // Methods to be overridden by subclasses
  protected _onUpdate(item: CommandItem<CMD>): void {
    item;
  }
}

export abstract class SettingCMD<T> extends CMD<{ change: T } & CMDEvents> {
  value: T;
  constructor(Category: CMDCategory<any>, initialValue: T) {
    super(Category);
    this.value = initialValue;
  }

  setValue(value: T) {
    if (this.value === value) return this;
    this.value = value;
    this.updateItem();
    this.emit("change", this.value);
    return this;
  }

  protected abstract _onUpdate(item: CommandItem<CMD>): void;
}

// Additional events can be defined in subclasses
export class toggleCMD extends SettingCMD<boolean> {
  constructor(Category: CMDCategory<any>, initialValue: boolean = false) {
    super(Category, initialValue);
    this.on("_click", () => this.setValue(!this.value));
  }

  protected _onUpdate(item: CommandItem<CMD>): void {
    item.addIconButton(btn =>
      btn
        .setIcon(this.value ? CheckSquare : Square)
        .setTooltip(this.value ? "Enabled" : "Disabled")
        .setDisabled(true)
    );
  }
}
