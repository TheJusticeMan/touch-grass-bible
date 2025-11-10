import { ChevronLeft, ChevronRight, SquarePen } from "lucide";
import TouchGrassBibleApp, {
  Button,
  Component,
  CrossRefCategory,
  Highlighter,
  IconButton,
  ScreenView,
  TextArea,
  VerseHighlight,
  VerseRef,
} from "./main";
import { BookScroll, ChapterScroll } from "./Scroll";
import { throttleWithInterval } from "./throttleWithInterval";

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
export class ChapterComponent extends Component<"div"> {
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
      const newVerse = new VerseRef(book, chapter, v);
      this.verses[v] = this.element.createEl("div", {}, (el: HTMLElement) => {
        el.createEl("div", { text: h(`${v} ${text}`), cls: "verse" }, (el: HTMLElement) => {
          if (text.includes("#")) el.addClass("versePBreak");

          el.addEventListener("click", () => (this.app.MainScreen.verse = newVerse));
          el.addEventListener("contextmenu", (e: Event) => {
            /* e.preventDefault();
            e.stopPropagation(); */
            this.app.openCommandPalette({ topCategory: CrossRefCategory, verse: newVerse });
          });
        });
        const note = newVerse.note;
        const createNoteInput = () => {
          new TextArea(el)
            .setValue(note)
            .addClass("noteArea")
            .setPlaceholder(" - Add your note here...")
            .on("click", e => e.stopPropagation())
            .on("input", (value: string) => {
              newVerse.note = value;
              this.app.saveSettingsAfterDelay();
            });
        };
        //new Button(el).setIcon(SquarePen);
        //new IconButton(el).setIcon(SquarePen).addClass("notebutton");
        let l: IconButton;
        if (note) createNoteInput();
        else
          l = new IconButton(el)
            .setIcon(SquarePen)
            .addClass("notebutton")
            .on("click", e => {
              l.remove();
              e.stopPropagation();
              createNoteInput();
              el.querySelector("textarea")?.focus();
            });
      });
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
 * Represents the main view for displaying Bible verses and chapters in the TouchGrassBibleApp.
 * Handles rendering, scrolling, and navigation between chapters and books.
 *
 * @remarks
 * - Maintains a buffer of rendered chapters for smooth scrolling and navigation.
 * - Integrates with command palette for verse selection and history.
 * - Handles scroll events to dynamically load previous/next chapters and update the current verse reference.
 * - Provides UI controls for navigating chapters and updating the screen title.
 *
 * @property {VerseRef} _verse - The current verse reference being displayed.
 * @property {HTMLElement} chapterContainer - The container element for chapter components.
 * @property {ChapterComponent[]} renderedChapters - Array of currently rendered chapter components.
 * @property {number} maxRenderedChapters - Maximum number of chapters to render at once (should be odd).
 * @property {number} scrollTriggerThreshold - Threshold for triggering chapter loading on scroll.
 * @property {number} _delayBeforeScroll - Timestamp for delaying scroll actions.
 * @property {ChapterScroll} chapterScroll - Handles chapter-level scrolling logic.
 * @property {BookScroll} bookScroll - Handles book-level scrolling logic.
 *
 * @method onload - Initializes the view, event listeners, and scroll handlers.
 * @method set delayBeforeScroll - Sets the delay before scroll actions are allowed.
 * @method get verse - Gets the current verse reference.
 * @method set verse - Sets the current verse reference and updates UI accordingly.
 * @method get title - Gets the current screen title.
 * @method set title - Sets the screen title and updates UI controls.
 * @method goprevChapter - Navigates to the previous chapter.
 * @method gonextChapter - Navigates to the next chapter.
 * @method updateTitle - Updates the screen title based on the current verse.
 * @method renderInitialChapters - Renders the initial buffer of chapters around the current verse.
 * @method highlightVerse - Scrolls to and highlights the current verse.
 * @method handleScroll - Handles scroll events to load chapters and update verse reference.
 * @method loadPreviousChapter - Loads and prepends the previous chapter to the view.
 * @method loadNextChapter - Loads and appends the next chapter to the view.
 */
export class VerseScreen extends ScreenView<TouchGrassBibleApp> {
  _verse: VerseRef = new VerseRef();
  chapterContainer!: HTMLElement;
  renderedChapters: ChapterComponent[] = [];
  maxRenderedChapters = 11; // Keep this an odd number
  scrollTriggerThreshold = 4;
  isScrolling = false;
  chapterScroll!: ChapterScroll;
  bookScroll!: BookScroll;

  onload(): void {
    this.on("titleclick", e => {
      e.stopPropagation();
      this.app.openCommandPalette({ topic: "", specificity: 0 });
    });

    this.on("menuclick", e => {
      e.stopPropagation();
      e.preventDefault();
      this.app.commandPalette.menu();
    });

    this.app.commandPalette.on("close", () => {
      const { verse } = this.app.commandPalette.state;
      this.verse = verse;
      VerseRef.Bookmarks.addToHistory(this.verse);
      this.app.saveSettings();
    });

    this.chapterContainer = this.content;
    this.content.addEventListener("scroll", this.handleScroll, { passive: true });

    this.verse = this.app.commandPalette.state.verse || new VerseRef("GENESIS", 1, 1);
    this.bookScroll = new BookScroll(this.content, v => {
      this.chapterScroll.show(v);
      return (this.verse = v);
    });
    this.chapterScroll = new ChapterScroll(this.content, v => {
      this.bookScroll.show(v);
      return (this.verse = v);
    });
  }

  get verse(): VerseRef {
    return this._verse;
  }

  set verse(value: VerseRef) {
    if (value.isSame(this._verse)) return;
    const shouldScroll = !this._verse || !this._verse.isSameChapter(value);
    this._verse = value;
    this.app.commandPalette.state.verse = value;
    this.updateTitle();
    if (!this.chapterScroll?.isGrabbed && !this.bookScroll?.isGrabbed)
      VerseRef.Bookmarks.addToHistory(this.verse);
    this.chapterScroll?.setRef(value);
    this.bookScroll?.setRef(value);

    if (!this.renderedChapters.some(c => c.verse.isSameChapter(value))) {
      this.renderInitialChapters();
    } else if (shouldScroll) {
      this.highlightVerse(true);
    } else {
      this.highlightVerse(false);
    }
  }

  get title(): string {
    return this.app.title;
  }

  set title(value: string) {
    this.app.title = value;
    if (this.titleEl) {
      this.sptitle(frag => {
        new Button(frag).setIcon(ChevronLeft).on("click", () => this.goprevChapter());
        frag.createEl("span", { text: value, cls: "titleText" });
        new Button(frag).setIcon(ChevronRight).on("click", () => this.gonextChapter());
        return frag;
      });
    }
  }

  goprevChapter() {
    this.verse = this._verse.prevChapter;
  }

  gonextChapter() {
    this.verse = this._verse.nextChapter;
  }

  updateTitle() {
    this.title = this._verse.toString().toTitleCase();
  }

  renderInitialChapters() {
    this.chapterContainer.empty();
    this.renderedChapters = [];

    const centerRef = this._verse;
    const chaptersToRender: VerseRef[] = [centerRef];

    let prev = centerRef;
    let next = centerRef;
    const buffer = Math.floor((this.maxRenderedChapters - 1) / 2);

    for (let i = 0; i < buffer; i++) {
      prev = prev.prevChapter;
      chaptersToRender.unshift(prev);
      next = next.nextChapter;
      chaptersToRender.push(next);
    }

    for (const ref of chaptersToRender) {
      const component = new ChapterComponent(this.chapterContainer, ref, this.app);
      this.renderedChapters.push(component);
    }

    this.waitFullUpdate(() => {
      this.highlightVerse(true);
    });
  }

  highlightVerse(instant = false) {
    const component = this.renderedChapters.find(c => c.verse.isSameChapter(this._verse));
    if (component) {
      if (instant) {
        component.scrollToInstant(this._verse);
      } else {
        component.scrollTo(this._verse);
      }
    }
  }

  handleScroll = throttleWithInterval(() => {
    if (this.chapterScroll.isGrabbed || this.bookScroll.isGrabbed) return;
    const { scrollTop, scrollHeight, clientHeight } = this.content;

    if (scrollTop < clientHeight * this.scrollTriggerThreshold) {
      this.loadPreviousChapter();
    } else if (scrollHeight - scrollTop - clientHeight < clientHeight * this.scrollTriggerThreshold) {
      this.loadNextChapter();
    }

    this.showScrollIndicators(this.CurrentVisibleChapter);
  }, 100);

  get CurrentVisibleChapter(): VerseRef {
    const viewMidpoint = this.content.scrollTop + this.content.clientHeight / 2;
    return this.renderedChapters.reduce(
      (closest, chapter) =>
        Math.abs(viewMidpoint - (chapter.element.offsetTop + chapter.element.offsetHeight / 2)) <
        Math.abs(viewMidpoint - (closest.element.offsetTop + closest.element.offsetHeight / 2))
          ? chapter
          : closest,
      this.renderedChapters[0]
    ).verse;
  }

  loadPreviousChapter() {
    const firstChapter = this.renderedChapters[0];
    if (!firstChapter) return;

    const prevRef = firstChapter.verse.prevChapter;
    if (this.renderedChapters.some(c => c.verse.isSameChapter(prevRef))) return;

    const component = new ChapterComponent(this.chapterContainer, prevRef, this.app);
    this.chapterContainer.prepend(component.element);
    this.renderedChapters.unshift(component);

    this.content.scrollTop += component.element.offsetHeight;

    if (this.renderedChapters.length > this.maxRenderedChapters) {
      const removed = this.renderedChapters.pop();
      removed?.remove();
    }
  }

  loadNextChapter() {
    const lastChapter = this.renderedChapters[this.renderedChapters.length - 1];
    if (!lastChapter) return;

    const nextRef = lastChapter.verse.nextChapter;
    if (this.renderedChapters.some(c => c.verse.isSameChapter(nextRef))) return;

    const component = new ChapterComponent(this.chapterContainer, nextRef, this.app);
    this.renderedChapters.push(component);

    if (this.renderedChapters.length > this.maxRenderedChapters) {
      const removed = this.renderedChapters.shift();
      removed?.remove();
    }
  }

  showScrollIndicators(v: VerseRef): this {
    this.chapterScroll?.show(v);
    this.bookScroll?.show(v);
    return this;
  }
}
