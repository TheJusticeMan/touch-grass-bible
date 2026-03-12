import { Item } from "./external/App";
import { Panel, View } from "./external/Workspace";
import TouchGrassBibleApp from "./main";
import { BookmarkCategoryID, BibleSearchCategoryID, myNotesCategoryID } from "./plugins/categoryIDs";

/**
 * Navigation panel for navigating through books and chapters.
 * The side will be a menu for opening the command palette.
 */
export class navigationPanel extends View {
  content: HTMLDivElement;
  constructor(
    panel: Panel,
    public app: TouchGrassBibleApp,
  ) {
    super(panel);
    this.containerEl.classList.add("workspace-sidepanel", "left");
    this.content = this.containerEl;
    this.updateContent();
  }

  updateContent() {
    this.content.empty();
    new Item(this.content)
      .setName("Search")
      .on("click", () => this.app.commandPalette.update({ topCategory: BibleSearchCategoryID }).open());
    new Item(this.content)
      .setName("Notes")
      .on("click", () => this.app.commandPalette.update({ topCategory: myNotesCategoryID }).open());
    new Item(this.content)
      .setName("Bookmarks")
      .on("click", () => this.app.commandPalette.update({ topCategory: BookmarkCategoryID }).open());
    new Item(this.content).setName("Menu").on("click", () => this.app.commandPalette.menu());
  }
}
