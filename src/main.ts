//import { createIcons, icons } from "lucide";
import "./style.css";
import { App } from "./external/App";
import MyHTML from "./external/MyHTML";
import bible from "./KJV.json";
import { match } from "assert";
import { Highlighter } from "./highlighter";

Object.assign(Node.prototype, MyHTML);
// add fuctions to HTMLElements

interface RealBibleAppSettings {
  enableLogging: boolean;
  fontSize: number;
  debug: boolean;
  reset: boolean;
  Foreground: string;
  Background: string;
  Accent1: string;
  Accent2: string;
  EnhanceSpacing: boolean;
  Font: string;
  includeAI: boolean;
  flipPages: boolean;
}

const DEFAULT_SETTINGS: RealBibleAppSettings = {
  enableLogging: true,
  fontSize: 16,
  debug: false,
  reset: false,
  Foreground: "hsl(0,100%,100%)",
  Background: "hsl(0,100%,0%)",
  Accent1: "hsl(275,100%,50%)",
  Accent2: "hsl(120,100%,50%)",
  EnhanceSpacing: true,
  Font: "Fontserif",
  includeAI: false,
  flipPages: false,
};
document.createElement;
const c: ElementCreationOptions = {
  /// <reference path="" />
};
class mainScreen {
  main: HTMLElement;
  content: HTMLElement;
  constructor(element: HTMLElement) {
    this.main = element.createEl("div", { cls: "navbar" }, (el) => {
      el.createEl("div", { cls: "navBarTitle", text: "Touch Grass Bible" });
      el.createEl("div", { cls: ["navBarMenu", "input"], text: "Menu" });
    });
    this.content = element.createEl("div", { cls: "content" });
    const c = new Highlighter([
      {
        regEXP: /\[(.+?)\]/gi,
        elTag: "i",
      },
      {
        regEXP: /(LORD|God)/gi,
        elTag: "b",
      },
      {
        regEXP: /^(\d+)/gi,
        elTag: "b",
        cls: "",
      },
    ]);
    for (let i = 1; i < bible["GENESIS"][1].length; i++) {
      console.log(bible["GENESIS"][1][i]);
      this.content.createEl("div", {
        text: c.highlight(`${i} ${bible["GENESIS"][1][i].replace("#", `\u00B6`)}`),
      });
    }
  }
}

class TouchGrassBibleApp extends App {
  settings: RealBibleAppSettings;

  constructor(doc: Document, DEFAULT_SETTINGS: any) {
    super(doc, DEFAULT_SETTINGS);
  }

  async onload() {
    new mainScreen(this.contentEl);
    await this.loadsettings(DEFAULT_SETTINGS);
    this.console.enabled = this.settings.enableLogging;
    this.console.log("Hello, world!");
    this.console.log(this.settings);
  }

  async loadsettings(DEFAULT_SETTINGS: any) {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  saveSettings() {
    this.saveData(this.settings);
  }
}

const TGB = TouchGrassBibleApp;

const app = new TouchGrassBibleApp(document, "Touch Grass Bible");
