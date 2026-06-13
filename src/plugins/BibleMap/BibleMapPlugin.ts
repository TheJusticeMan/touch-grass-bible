import Plugin from "src/core/Plugin";
import { Map } from "lucide";
import { BibleMapView, BIBLE_MAP_VIEW_ID } from "./BibleMapView";

export default class BibleMapPlugin extends Plugin {
  async onload(): Promise<void> {
    this.registerView(BIBLE_MAP_VIEW_ID, () => new BibleMapView(this));

    this.registerCommand({
      id: "open-bible-map",
      name: "Open Bible Map",
      icon: Map,
      description: "Open the interactive 2D Bible Land Map.",
      callback: () => this.revealBibleMap(),
    });
  }

  private revealBibleMap(): void {
    const activeView = this.app.workspace.layoutController.activeView.val;
    if (activeView?.viewTypeId === BIBLE_MAP_VIEW_ID)
      return void this.app.workspace.layoutController.focusActiveView();

    this.app.workspace.layoutController.addViewToPanel(BIBLE_MAP_VIEW_ID);
  }
}
