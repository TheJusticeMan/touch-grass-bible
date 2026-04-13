import Plugin from "src/core/Plugin";
import { Map } from "lucide";
import { BibleMapView, BIBLE_MAP_VIEW_ID } from "./BibleMapView";

type RevealWorkspace = {
  revealView?: (viewId: string) => boolean | void;
};

export default class BibleMapPlugin extends Plugin {
  async onload(): Promise<void> {
    this.registerView(BIBLE_MAP_VIEW_ID, panel => new BibleMapView(panel, this));

    this.registerCommand({
      id: "open-bible-map",
      name: "Open Bible Map",
      icon: Map,
      description: "Open the interactive 2D Bible Land Map.",
      callback: () => this.revealBibleMap(),
    });
  }

  private revealBibleMap(): void {
    const workspace = this.app.workspace as typeof this.app.workspace & RevealWorkspace;
    if (typeof workspace.revealView === "function") {
      workspace.revealView(BIBLE_MAP_VIEW_ID);
      return;
    }

    const activated = this.app.workspace.activateView(BIBLE_MAP_VIEW_ID);
    if (activated) {
      return;
    }

    const panel = this.app.workspace.activePanel;
    if (!panel) {
      this.app.console.warn("Unable to open bible-map view because there is no active panel.");
      return;
    }

    this.app.workspace.openView(BIBLE_MAP_VIEW_ID, panel, {
      activate: true,
      title: "Bible Map",
    });
  }
}
