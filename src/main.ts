export const processstart = new Date().getTime();
import { ChevronLeft, ChevronRight } from "lucide";
import { BibleTopics, BibleTopicsType } from "./BibleTopics";
import {
  App,
  Button,
  Component,
  Highlighter,
  ScreenView,
  Scrollpast,
  UnifiedCommandPalette,
} from "./external/App";
import info from "./info.json";
import { BookScroll, ChapterScroll } from "./Scroll";
import { notesPanel } from "./sidepanels";
import "./style.css";
import { DEFAULT_SETTINGS, TGAppSettings } from "./TGAppSettings";
import {
  BibleSearchCategory,
  BookmarkCategory,
  CrossRefCategory,
  GoToVerseCategory,
  myNotesCategory,
  SettingsCategory,
  TGPaletteState,
  topicListCategory,
  translationCategory,
  VerseListCategory,
} from "./TGPaletteCategories";
import { bibleData, VerseHighlight, VerseRef } from "./VerseRef";

export * from "./external/App";
export * from "./VerseRef";
export * from "./TGAppSettings";
export * from "./TGPaletteCategories";

/**
 * Represents the main screen for displaying and interacting with a single verse in the TouchGrassBibleApp.
 *
 * The `VerseScreen` class extends `ScreenView` and manages the display, selection, and highlighting of verses.
 * It synchronizes the current verse with the application's command palette and updates the UI accordingly.
 *
 * ### Features
 * - Displays verses from a specified book, chapter, and verse reference.
 * - Allows users to select verses by clicking, updating the active verse and UI.
 * - Supports context menu actions for verses, such as opening the command palette with cross-references.
 * - Keeps the application title and DOM in sync with the current verse.
 * - Handles paragraph breaks and highlights the active verse.
 *
 * @template T The application type, expected to be `TouchGrassBibleApp`.
 * @extends ScreenView<TouchGrassBibleApp>
 *
 * @property {VerseRef} verse - The current verse reference being displayed and interacted with.
 * @property {string} title - The title of the screen, synchronized with the app's title and DOM.
 *
 * @method update - Updates the display and UI based on the current verse, including highlighting and scrolling.
 *
 * @constructor
 * @param {HTMLElement} element - The root element for the screen view.
 * @param {TouchGrassBibleApp} app - The application instance.
 */
class VerseScreen extends ScreenView<TouchGrassBibleApp> {
  _verse: VerseRef;
  scrollToTop: boolean;
  ChEls: ChapterComponent[];
  chapterScroll: ChapterScroll;
  bookScroll: BookScroll;
  _delayBeforeScroll: number = 500;

  onload(): void {
    this.app.MainScreen.delayBeforeScroll = 1000;
    this.on("titleclick", e => {
      e.stopPropagation();
      this.app.openCommandPalette({ topic: "", specificity: 0 });
    });

    this.app.commandPalette.on("close", () => {
      this.delayBeforeScroll = 1000;
      const { verse, defaultTranslation } = this.app.commandPalette.state;
      this.verse = verse;
      VerseRef.Bookmarks.addToHistory(this.verse);
      this.app.saveSettings();
    });

    // Initialize with a default verse
    this.verse = this.app.commandPalette.state.verse || new VerseRef("GENESIS", 1, 1);
    new Scrollpast(this.content)
      .on("scrollpasttop", () => this.goprevChapter())
      .on("scrollpastbottom", () => this.gonextChapter());
    this.bookScroll = new BookScroll(this.content, v => {
      this.delayBeforeScroll = 1000;
      this.chapterScroll.show(v);
      return (this.verse = v);
    });
    this.chapterScroll = new ChapterScroll(this.content, v => {
      this.delayBeforeScroll = 1000;
      this.bookScroll.show(v);
      return (this.verse = v);
    });
  }

  // Title property syncs app title and DOM
  get title(): string {
    return this.app.title;
  }

  set title(value: string) {
    this.app.title = value;
    if (this.titleEl) {
      this.sptitle(frag => {
        new Button(frag).setIcon(ChevronLeft).on("click", e => this.goprevChapter());
        frag.createEl("span", { text: value, cls: "titleText" });
        new Button(frag).setIcon(ChevronRight).on("click", e => this.gonextChapter());
        return frag;
      });
    }
  }

  // Getter and setter for the current verse
  get verse(): VerseRef {
    return this._verse;
  }

  set verse(value: VerseRef) {
    const sameChapter =
      this._verse && this._verse.book === value.book && this._verse.chapter === value.chapter;
    this.scrollToTop = this._verse ? !sameChapter : true;
    this._verse = value;
    this.app.commandPalette.state.verse = value;
    this.update();
    this.chapterScroll?.setRef(value);
    this.bookScroll?.setRef(value);
    this.app.leftpanel?.updateContent(value);
    this.scrollToTop = true;
  }

  gonextChapter() {
    this.delayBeforeScroll = 1000;
    this.verse = this._verse.nextChapter;
  }

  goprevChapter() {
    this.delayBeforeScroll = 1000;
    this.verse = this._verse.prevChapter.setVerse(1);
  }

  set delayBeforeScroll(value: number) {
    // fixes the bug in scroll to next chapter
    this._delayBeforeScroll = Date.now() + value;
  }

  /**
   * Updates the display based on the current verse.
   */
  update(): void {
    // Update the window title to the verse's title in Title Case
    this.title = this._verse.toString().toTitleCase();

    this.content.empty();
    const { prevChapter, nextChapter } = this._verse;
    this.ChEls = [
      new ChapterComponent(this.content, prevChapter, this.app),
      new ChapterComponent(this.content, this._verse, this.app),
      new ChapterComponent(this.content, nextChapter, this.app),
    ];
    this.content.removeEventListener("scroll", this.handleScroll);
    if (this.scrollToTop) this.ChEls[1].element.scrollIntoView({ block: "start", behavior: "instant" });
    this.waitFullUpdate(() => {
      this.ChEls[1].scrollTo(this._verse);
      this.content.addEventListener("scroll", this.handleScroll, { passive: true });
    });
  }

  private handleScroll = () => {
    if (
      !this.scrollToTop ||
      this.chapterScroll.isGrabbed ||
      this.bookScroll.isGrabbed ||
      Date.now() < this._delayBeforeScroll
    )
      return;
    // Get the element's position relative to the viewport
    const rect = this.app.MainScreen.ChEls[1].element.getBoundingClientRect();

    // Check if the top of the element is at or above the viewport's top
    if (rect.bottom < 0 || rect.top > 0) {
      this.verse = rect.bottom < 0 ? this._verse.nextChapter : this._verse.prevChapter;
      this.ChEls[1].scrollToInstant(this.verse);
      this.chapterScroll.show(this.verse);
      this.bookScroll.show(this.verse);
    }
  };
}

/**
 * Represents a UI component for displaying a chapter of verses in the TouchGrass Bible application.
 *
 * This component renders a chapter header and a list of verses, each as a clickable element.
 * Clicking a verse updates the application's main screen to focus on the selected verse.
 * Right-clicking (context menu) on a verse opens the command palette with cross-reference options.
 *
 * @template "div" - The HTML element type for the root of this component.
 *
 * @extends Component<"div">
 *
 * @property verses - An array of HTMLDivElement references for each verse in the chapter.
 * @property verse - The reference to the current chapter (and optionally verse) being displayed.
 * @property app - The main application instance, used for navigation and command palette actions.
 *
 * @constructor
 * @param parent - The parent HTML element to which this component will be attached.
 * @param ref - The reference object containing book, chapter, and verse data.
 * @param app - The main application instance.
 *
 * @method removeActive - Removes the "verseActive" class from any currently active verse element.
 * @method scrollTo - Smoothly scrolls to the specified verse and marks it as active.
 * @method scrollToInstant - Instantly scrolls to the specified verse and marks it as active.
 */
class ChapterComponent extends Component<"div"> {
  verses: HTMLDivElement[] = [];
  verse: VerseRef;
  constructor(parent: HTMLElement, ref: VerseRef, private app: TouchGrassBibleApp) {
    super(parent, "div");
    this.verse = ref;
    const h: Highlighter["highlight"] = VerseHighlight.highlight.bind(VerseHighlight);
    const { book, chapter } = ref;
    this.element.addClass("chapter");
    this.element.createEl("h2", { text: h(`${book.toTitleCase()} ${chapter}`), cls: "chapterTitle" });
    ref.cTXT.forEach((text: string, v: number) => {
      if (v === 0) return;
      this.verses[v] = this.element.createEl(
        "div",
        { text: h(`${v} ${text}`), cls: "verse" },
        (el: HTMLElement) => {
          if (text.includes("#")) el.addClass("versePBreak");

          const newVerse = new VerseRef(book, chapter, v);
          el.addEventListener("click", () => {
            this.app.MainScreen.delayBeforeScroll = 1000;
            this.app.MainScreen.verse = newVerse;
          });
          el.addEventListener("contextmenu", (e: Event) => {
            e.preventDefault();
            e.stopPropagation();
            this.app.openCommandPalette({ topCategory: CrossRefCategory, verse: newVerse });
          });
        }
      );
    });
  }

  removeActive() {
    this.element.querySelector(".verseActive")?.classList.remove("verseActive");
  }

  scrollTo(verse: VerseRef) {
    this.removeActive();
    this.verses[verse.verse]?.scrollIntoView({ behavior: "smooth", block: "start" });
    this.verses[verse.verse]?.classList.add("verseActive");
  }

  scrollToInstant(verse: VerseRef) {
    this.removeActive();
    this.verses[verse.verse]?.scrollIntoView({ block: "start" });
    this.verses[verse.verse]?.classList.add("verseActive");
  }
}

/**
 * Main application class for the Touch Grass Bible app.
 *
 * Handles initialization, settings management, command palette integration,
 * and loading of core Bible data (KJV, cross-references, topics).
 *
 * @extends App
 *
 * @property {TGAppSettings} settings - Application settings.
 * @property {TGCommandPalette} commandPalette - The command palette instance for user commands.
 * @property {VerseScreen} MainScreen - The main screen displaying Bible verses.
 *
 * @constructor
 * @param {Document} doc - The document object for the app context.
 *
 * @method onload - Initializes the app, loads settings and data, sets up palettes and event listeners.
 * @method openCommandPalette - Opens the command palette with an optional state.
 * @method onunload - Handles cleanup when the app is unloaded.
 * @method loadsettings - Loads and merges user settings with defaults.
 * @method saveSettings - Persists the current settings.
 */
export default class TouchGrassBibleApp extends App {
  settings: TGAppSettings;
  commandPalette: UnifiedCommandPalette<TouchGrassBibleApp, TGPaletteState>;
  MainScreen: VerseScreen;
  firstLoad = true;
  leftpanel: notesPanel;
  saveTimeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor(doc: Document) {
    super(doc, "Touch Grass Bible");
  }

  async onload() {
    this.MainScreen = new VerseScreen(this.contentEl, this);

    this.leftpanel = new notesPanel(this, this.contentEl);
    this.on("ArrowRightKeyDown", e => this.leftpanel.open());
    this.commandPalette = new UnifiedCommandPalette<TouchGrassBibleApp, TGPaletteState>(this);
    this.commandPalette.state = new TGPaletteState(this.commandPalette as any, "");
    this.commandPalette
      .addPalettes(
        VerseListCategory,
        CrossRefCategory,
        BookmarkCategory,
        GoToVerseCategory,
        topicListCategory,
        BibleSearchCategory,
        translationCategory,
        myNotesCategory,
        SettingsCategory
      )
      .on("update", e => {
        VerseRef.defaultTranslation = e.defaultTranslation;
        this.MainScreen.verse = e.verse;
      });

    await this.loadsettings(DEFAULT_SETTINGS);
    // Load all JSON files in parallel for faster startup
    const [crossRefs, topics, translations] = await Promise.all([
      this.loadJSON<{ [x: string]: never[] }>("crossrefs.json"),
      this.loadJSON<BibleTopicsType>("topics.json"),
      this.loadJSON<{ [translation: string]: bibleData }>("translations.json"),
    ]);

    this.commandPalette.columns = this.contentEl.offsetWidth > 800;
    window.addEventListener("resize", () => {
      const isWide = this.contentEl.offsetWidth > 800;
      if (this.commandPalette.columns !== isWide) {
        this.commandPalette.columns = isWide;
        this.commandPalette.isOpen && this.commandPalette.display();
      }
    });

    VerseRef.bibleTranslations = translations;
    VerseRef.crossRefs = crossRefs;
    VerseRef.topics = new BibleTopics(topics);
    VerseRef.Bookmarks = new BibleTopics(this.settings.Bookmarks);
    this.commandPalette.state.verse = VerseRef.RandomVerse;
    this.console.enabled = this.settings.enableLogging;
    this.console.log(info.name, info.version, "loaded");
    this.on("EnterKeyDown", e => !this.commandPalette.isOpen && this.openCommandPalette());

    this.console.log(new Date().getTime() - processstart, "ms startup time");
    this.console.log("Touch Grass Bible is ready!");

    this.MainScreen.onload();
  }

  openCommandPalette(TGPaletteState: Partial<TGPaletteState> = {}): void {
    this.commandPalette.update(TGPaletteState).open();
    if (this.settings.showHelp && this.firstLoad) {
      this.firstLoad = false;
      this.commandPalette.setValue("Welcome to Touch Grass Bible!", true);
    }
  }

  onunload(): boolean {
    return true;
  }

  async loadsettings(DEFAULT_SETTINGS: TGAppSettings) {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    VerseRef.myNotes = new Map(this.settings.myNotes);
  }

  saveSettings() {
    this.settings.Bookmarks = VerseRef.Bookmarks.toJSON();
    this.settings.myNotes = Array.from(VerseRef.myNotes.entries());
    this.saveData(this.settings);
  }

  saveSettingsAfterDelay(delay: number = 5000) {
    // Clear the previous timeout if it exists
    if (this.saveTimeoutId !== null) {
      clearTimeout(this.saveTimeoutId);
      this.saveTimeoutId = null; // Reset the timeout ID
    }

    // Set a new timeout
    this.saveTimeoutId = setTimeout(() => {
      this.saveSettings();
      this.console.log("Settings saved after 5 seconds");
      this.saveTimeoutId = null; // Reset after execution
    }, delay);
  }
}

const app = new TouchGrassBibleApp(document);
