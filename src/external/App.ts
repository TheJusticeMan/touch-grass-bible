import "./App.css";
import { BrowserConsole } from "./MyBrowserConsole";
import MyHTML, { DomElementInfo } from "./MyHTML";
export { MyHTML, BrowserConsole, DomElementInfo, App };

interface Apphistory {
  name: string;
  time: Date;
  data: any;
}

class App {
  console: BrowserConsole;
  contentEl: HTMLElement;
  private historypoz: Apphistory[];
  doc: Document;
  constructor(doc: Document, title: string) {
    this.console = new BrowserConsole(true, "Real Bible App:");
    this.historypoz = [];
    this.doc = doc;
    if (title) this.title = title;
    this.contentEl = doc.body.createEl("div", { cls: "AppShellElement" });
    doc.addEventListener("DOMContentLoaded", this.load.bind(this));
    // Add event listener for beforeunload to handle close attempts
    window.addEventListener("beforeunload", (e) => {
      // Call exit() method and prevent default if needed
      if (!this.exit()) {
        e.preventDefault();
        e.returnValue = "";
      }
    });
    window.addEventListener("popstate", (e) => {
      const c = this.historypoz.pop();
      if (this.historypoz.length == 0) {
        this.exit();
        return;
      }
      this.onhistorypop(this.historypoz[this.historypoz.length - 1]);
    });
  }

  exit(): boolean {
    return this.unload();
  }

  load() {
    this.onload();
  }

  unload(): boolean {
    return this.onunload();
  }

  historypush(cl: Partial<Apphistory>) {
    const c: Apphistory = {
      name: cl.name ?? "",
      time: new Date(),
      data: cl.data ?? null,
    };
    this.historypoz.push(c);
    history.pushState(c, "", "");
  }

  historypop() {
    this.historypoz.pop();
    if (this.historypoz.length == 0) {
      this.exit();
      return;
    }
    this.onhistorypop(this.historypoz[this.historypoz.length - 1]);
  }

  async onload() {}
  onhistorypop(c: Apphistory) {}
  onunload(): boolean {
    return true;
  }

  onback() {
    this.unload();
  }

  async saveData(data: any) {
    localStorage.setItem("app-data", JSON.stringify(data));
  }

  async loadData(): Promise<any> {
    return Promise.resolve(JSON.parse(localStorage.getItem("app-data") || "{}"));
  }

  public get title(): string {
    return this.doc.title;
  }

  public set title(value: string) {
    this.doc.title = value;
  }
}
