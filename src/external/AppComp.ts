import "./MyHTML";
import "./AppComp.css";
export abstract class BaseComponent {
  disabled: boolean;
  then(cb: (component: this) => void): this {
    cb(this);
    return this;
  }
  setDisabled(disabled: boolean): this {
    this.disabled = disabled;
    return this;
  }
}
class ButtonComponent extends BaseComponent {
  buttonEl: HTMLButtonElement;
  constructor(containerEl: HTMLElement) {
    super();
    this.buttonEl = containerEl.createEl("button");
  }
  setButtonText(text: string): this {
    this.buttonEl.textContent = text;
    return this;
  }
}
class ExtraButtonComponent extends BaseComponent {
  buttonEl: HTMLDivElement;
  constructor(containerEl: HTMLElement) {
    super();
  }
}
export abstract class ValueComponent<T> extends BaseComponent {
  registerOptionListener(listeners: Record<string, (value?: T) => T>, key: string): this {
    return this;
  }
  abstract getValue(): T;
  abstract setValue(value: T): this;
}
export class AbstractTextComponent<
  T extends HTMLInputElement | HTMLTextAreaElement
> extends ValueComponent<string> {
  inputEl: T;
  constructor(inputEl: T) {
    super();
  }
  setDisabled(disabled: boolean): this {
    return this;
  }
  getValue(): string {
    return "this";
  }
  setValue(value: string): this {
    return this;
  }
  setPlaceholder(placeholder: string): this {
    return this;
  }
  onChanged(): void {
    return;
  }
  onChange(callback: (value: string) => any): this {
    return this;
  }
}
class TextComponent extends AbstractTextComponent<HTMLInputElement> {
  constructor(containerEl: HTMLElement) {
    super(containerEl.createEl("input"));
  }
}
class TextAreaComponent extends AbstractTextComponent<HTMLTextAreaElement> {
  constructor(containerEl: HTMLElement) {
    super(containerEl.createEl("textarea"));
  }
}
class SearchComponent extends AbstractTextComponent<HTMLInputElement> {
  constructor(containerEl: HTMLElement) {
    super(containerEl.createEl("input"));
  }
}
class ToggleComponent extends ValueComponent<boolean> {
  constructor(containerEl: HTMLElement) {
    super();
  }
  setValue(value: boolean): this {
    return this;
  }
  getValue(): boolean {
    return true;
  }
}
class ColorComponent extends ValueComponent<string> {
  constructor(containerEl: HTMLElement) {
    super();
  }
  setValue(value: string): this {
    return this;
  }
  getValue(): string {
    return "true";
  }
}
class SliderComponent extends ValueComponent<number> {
  constructor(containerEl: HTMLElement) {
    super();
  }
  setValue(value: number): this {
    return this;
  }
  getValue(): number {
    return 1;
  }
}
class DropdownComponent extends ValueComponent<string> {
  constructor(containerEl: HTMLElement) {
    super();
  }
  setValue(value: string): this {
    return this;
  }
  getValue(): string {
    return "true";
  }
}
class ProgressBarComponent extends ValueComponent<number> {
  constructor(containerEl: HTMLElement) {
    super();
  }
  setValue(value: number): this {
    return this;
  }
  getValue(): number {
    return 1;
  }
}
export class Setting {
  settingEl: HTMLElement;
  infoEl: HTMLElement;
  nameEl: HTMLElement;
  descEl: HTMLElement;
  controlEl: HTMLElement;
  components: BaseComponent[] = [];
  constructor(containerEl: HTMLElement) {
    this.settingEl = containerEl.createEl("div", { cls: "setting-item" }, setEl => {
      this.infoEl = setEl.createEl("div", { cls: "setting-item-info" }, inEl => {
        this.nameEl = inEl.createEl("div", { cls: "setting-item-name" });
        this.descEl = inEl.createEl("div", { cls: "setting-item-description" });
      });
      this.controlEl = setEl.createEl("div", { cls: "setting-item-control" });
    });
  }
  setName(name: string | DocumentFragment): this {
    if (typeof name === "string") {
      this.nameEl.textContent = name;
    } else if (name instanceof DocumentFragment) {
      this.nameEl.empty();
      this.nameEl.appendChild(name);
    }
    return this;
  }
  setDesc(desc: string | DocumentFragment): this {
    if (typeof desc === "string") {
      this.descEl.textContent = desc;
    } else if (desc instanceof DocumentFragment) {
      this.descEl.empty();
      this.descEl.appendChild(desc);
    }
    return this;
  }
  setClass(cls: string): this {
    this.settingEl.addClass(cls);
    return this;
  }
  setTooltip(tooltip: string /* , options?: TooltipOptions */): this {
    return this;
  }
  setHeading(): this {
    this.settingEl.addClass("setting-item-heading");
    return this;
  }
  setDisabled(disabled: boolean): this {
    this.settingEl.classList.toggle("disabled", disabled);
    this.components.forEach(component => component.setDisabled(disabled));
    return this;
  }
  addButton(cb: (component: ButtonComponent) => any): this {
    this.components.push(new ButtonComponent(this.controlEl).then(cb));
    return this;
  }
  addExtraButton(cb: (component: ExtraButtonComponent) => any): this {
    this.components.push(new ExtraButtonComponent(this.controlEl).then(cb));
    return this;
  }
  addToggle(cb: (component: ToggleComponent) => any): this {
    this.components.push(new ToggleComponent(this.controlEl).then(cb));
    return this;
  }
  addText(cb: (component: TextComponent) => any): this {
    this.components.push(new TextComponent(this.controlEl).then(cb));
    return this;
  }
  addSearch(cb: (component: SearchComponent) => any): this {
    this.components.push(new SearchComponent(this.controlEl).then(cb));
    return this;
  }
  addTextArea(cb: (component: TextAreaComponent) => any): this {
    this.components.push(new TextAreaComponent(this.controlEl).then(cb));
    return this;
  }
  addDropdown(cb: (component: DropdownComponent) => any): this {
    this.components.push(new DropdownComponent(this.controlEl).then(cb));
    return this;
  }
  addColorPicker(cb: (component: ColorComponent) => any): this {
    this.components.push(new ColorComponent(this.controlEl).then(cb));
    return this;
  }
  addProgressBar(cb: (component: ProgressBarComponent) => any): this {
    this.components.push(new ProgressBarComponent(this.controlEl).then(cb));
    return this;
  }
  addSlider(cb: (component: SliderComponent) => any): this {
    this.components.push(new SliderComponent(this.controlEl).then(cb));
    return this;
  }
  then(cb: (setting: this) => any): this {
    cb(this);
    return this;
  }
  clear(): this {
    return this;
  }
}
