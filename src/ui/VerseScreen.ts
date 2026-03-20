import apocalypseThrottle from "apocalypse-throttle";
import { LayoutNode, View } from "../external/Workspace";
import type { PaletteState } from "../external/PaletteStateController";
import TouchGrassBibleApp from "../main";
import { BookScroll, ChapterScroll } from "./Scroll";
import "./VerseScreen.css";
import { UIComponent, IconButton } from "../external/UIComponents";
import { pdsp } from "../external/Event";
import { Highlighter } from "../external/highlighter";
import { VerseRef } from "../models/VerseRef";

export const VerseHighlight: Highlighter = new Highlighter([
  { regEXP: /\[(.+?)\]/gi, elTag: "i" },
  { regEXP: /(LORD|God)/gi, elTag: "b" },
  { regEXP: /^(\d+)/gi, cls: "number" },
  { regEXP: /#/gi, cls: "paragraph-break", replace: "\u00B6" },
]);

type VerseScreenState = {
  version: 1;
  verse: {
    book: string;
    chapter: number;
    verse: number;
  };
};

/**
 * Represents a UI component for displaying a chapter of verses in the TouchGrass Bible application.
 *
 * This component renders a chapter header and a list of verses, each as a clickable element.
 * Clicking a verse updates the application's main screen to focus on the selected verse.
 * Right-clicking (context menu) on a verse opens the command palette with cross-reference options.
 *
 * @template "div" - The HTML element type for the root of this component.
 *
 * @extends UIComponent<"div">
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
 * @method removeActive - Removes the "active" class from any currently active verse element.
 * @method scrollTo - Smoothly scrolls to the specified verse and marks it as active.
 * @method scrollToInstant - Instantly scrolls to the specified verse and marks it as active.
 */
export class ChapterComponent extends UIComponent<"div"> {
  verse: VerseRef;
  verses: HTMLDivElement[] = [];
  verseInfos: VerseInfoComponent[] = []; // New: Array of components instead of raw elements

  constructor(
    parent: HTMLElement,
    ref: VerseRef,
    private app: TouchGrassBibleApp,
  ) {
    super(parent, "div");
    this.verse = ref;
    const h: Highlighter["highlight"] = VerseHighlight.highlight.bind(VerseHighlight);
    const { book, chapter } = ref;
    this.addClass("chapter");
    this.createChild("h2", {
      text: h(ref.toChapterString()),
      cls: "chapter-title",
    });
    ref.cTXT.forEach((text: string, v: number) => {
      if (v === 0) return;
      const newVerse = new VerseRef(book, chapter, v);
      this.verses[v] = this.createChild("div", {}, (el: HTMLElement) => {
        el.createEl("div", { text: h(`${v} ${text}`), cls: "verse" }, (el: HTMLElement) => {
          if (text.includes("#")) el.addClass("paragraph-break");

          el.addEventListener("click", () => this.app.verseState.set(newVerse));
          el.addEventListener(
            "contextmenu",
            pdsp(
              () => (
                app.verseState.set(newVerse),
                this.app.openCommandPalette({ topCategory: "tsk-cross-ref" })
              ),
            ),
          );
        });
        // Replace raw div creation with the new component
        this.verseInfos[v] = new VerseInfoComponent(el, newVerse, this.app);
      });
    });
  }

  removeActive() {
    this.element.querySelector(".active")?.classList.remove("active");
  }

  setActive(verse: VerseRef) {
    this.verses[verse.verse]?.classList.add("active");
    this.verseInfos[verse.verse]?.render(); // Render the info container when active
  }

  scrollTo(verse: VerseRef) {
    this.removeActive();
    this.verses[verse.verse]?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
    this.setActive(verse);
  }

  scrollToInstant(verse: VerseRef) {
    this.removeActive();
    this.verses[verse.verse]?.scrollIntoView({ block: "start" });
    this.setActive(verse);
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
export class VerseScreen extends View {
  content: HTMLElement;
  verseState: PaletteState<VerseRef>;
  chapterContainer!: HTMLElement;
  renderedChapters: ChapterComponent[] = [];
  maxRenderedChapters = 11; // Keep this an odd number
  scrollTriggerThreshold = 4;
  isScrolling = false;
  chapterScroll!: ChapterScroll;
  bookScroll!: BookScroll;
  private highlightedVerse: VerseRef | null = null;

  private isVerseScreenState(state: unknown): state is VerseScreenState {
    if (!state || typeof state !== "object") return false;
    const candidate = state as Partial<VerseScreenState>;
    if (candidate.version !== 1 || !candidate.verse) return false;
    const { book, chapter, verse } = candidate.verse;
    return (
      typeof book === "string" &&
      Number.isInteger(chapter) &&
      chapter > 0 &&
      Number.isInteger(verse) &&
      verse > 0
    );
  }

  constructor(
    panel: LayoutNode,
    protected app: TouchGrassBibleApp,
  ) {
    super(panel);
    this.containerEl.classList.add("screen-view", "content");
    this.verseState = this.app.commandPalette.useState(new VerseRef("GENESIS", 1, 1));
    this.content = this.containerEl; //.createEl("div", { cls: "content" });
  }

  onAttach(): void {
    this.verseState.onChange(verse => {
      this.updateTitle();
      this.chapterScroll?.setRef(verse);
      this.bookScroll?.setRef(verse);

      if (!this.renderedChapters.some(c => c.verse.isSameChapter(verse))) {
        this.renderInitialChapters();
      } else {
        this.highlightVerse(false);
      }

      this.requestStateSave();
    });

    this.chapterContainer = this.content;
    this.content.addEventListener("scroll", this.handleScroll, { passive: true });

    this.bookScroll = new BookScroll(this.content, v => (this.chapterScroll.show(v), (this.verse = v)));
    this.chapterScroll = new ChapterScroll(this.content, v => (this.bookScroll.show(v), (this.verse = v)));

    this.app.on("verse-actions-change", () => this.refreshActiveVerseInfo());

    this.app.on(
      "verse-info-highlight",
      verse => verse instanceof VerseRef && this.highlightVerseInfoButton(verse),
    );
  }

  /**
   * Called when this view is activated (becomes the visible view).
   * Checks if this view is already the active verse screen to avoid redundant setup.
   */
  onActivate(): void {
    if (!VerseRef.bible) return;
    this.updateTitle();
    this.chapterScroll?.setRef(this.verse);
    this.bookScroll?.setRef(this.verse);

    if (!this.renderedChapters.some(c => c.verse.isSameChapter(this.verse))) {
      this.renderInitialChapters();
    } else {
      this.highlightVerse(true);
    }
  }

  private get verse(): VerseRef {
    return this.verseState.get();
  }

  private set verse(value: VerseRef) {
    //if (value.isSame(this.verse)) return;
    this.verseState.set(value);
  }

  updateTitle() {
    this.title = this.verse.toString();
  }

  renderInitialChapters() {
    //this.chapterContainer.empty();  this was deleting the scroll bubbles, so instead we just remove the chapter components

    this.renderedChapters.forEach(c => c.remove());

    this.renderedChapters = [];

    const centerRef = this.verse;
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

  removeActive() {
    this.renderedChapters.forEach(c => c.removeActive());
  }

  highlightVerse(instant = false) {
    this.removeActive();
    const component = this.renderedChapters.find(c => c.verse.isSameChapter(this.verse));
    if (component) {
      if (instant) {
        component.scrollToInstant(this.verse);
      } else {
        component.scrollTo(this.verse);
      }
      this.highlightVerseInfoButton(this.verse);
    }
  }

  private refreshActiveVerseInfo(): void {
    const component = this.renderedChapters.find(c => c.verse.isSameChapter(this.verse));
    component?.verseInfos[this.verse.verse]?.render();
    this.highlightVerseInfoButton(this.verse);
  }

  private highlightVerseInfoButton(verse: VerseRef): void {
    this.clearHighlightedVerseInfo();
    const component = this.renderedChapters.find(c => c.verse.isSameChapter(verse));
    const info = component?.verseInfos[verse.verse];
    if (!info) {
      this.highlightedVerse = null;
      return;
    }
    info.element.classList.add("is-highlighted");
    this.highlightedVerse = verse;
  }

  private clearHighlightedVerseInfo(): void {
    if (!this.highlightedVerse) return;
    const component = this.renderedChapters.find(c => c.verse.isSameChapter(this.highlightedVerse!));
    component?.verseInfos[this.highlightedVerse.verse]?.element.classList.remove("is-highlighted");
    this.highlightedVerse = null;
  }

  handleScroll = apocalypseThrottle(() => {
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
    // get the last chapter starting above the top of the view
    const viewTop = this.content.scrollTop;
    const chapter = this.renderedChapters.findLast(c => c.element.offsetTop < viewTop);
    return chapter?.verse || this.renderedChapters[0].verse;
  }

  get midViewChapter(): VerseRef {
    // Alternatively, get the chapter closest to the midpoint of the view
    const viewMidpoint = this.content.scrollTop + this.content.clientHeight / 2;
    return this.renderedChapters.reduce(
      (closest, chapter) =>
        Math.abs(viewMidpoint - (chapter.element.offsetTop + chapter.element.offsetHeight / 2)) <
        Math.abs(viewMidpoint - (closest.element.offsetTop + closest.element.offsetHeight / 2))
          ? chapter
          : closest,
      this.renderedChapters[0],
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
    if (!v.isSameChapter(this.verse)) this.title = v.toChapterString();
    else this.updateTitle();
    return this;
  }

  waitFullUpdate(cb: () => void): void {
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => cb()));
  }

  getViewState(): unknown {
    const current = this.verse;
    return {
      version: 1,
      verse: {
        book: current.book,
        chapter: current.chapter,
        verse: current.verse,
      },
    } satisfies VerseScreenState;
  }

  setViewState(state: unknown): void {
    if (!this.isVerseScreenState(state)) return;
    if (!VerseRef.booksOfTheBible.includes(state.verse.book)) return;
    this.verseState.set(new VerseRef(state.verse.book, state.verse.chapter, state.verse.verse));
  }
}

/**
 * A component for displaying and managing verse-specific information (e.g., notes, bookmarks, topics).
 * Encapsulates the logic for rendering an info container below each verse.
 *
 * This replaces the raw `info-container[v]` div and the `renderNoteArea` method,
 * promoting reusability and modularity. It handles dynamic rendering of notes (as a textarea),
 * bookmarks, and topics based on the provided VerseRef.
 *
 * @extends UIComponent<"div">
 *
 * @property verse - The VerseRef associated with this info container.
 * @property app - The main TouchGrassBibleApp instance for navigation and state management.
 *
 * @method render - Updates and renders the info container's contents (notes, buttons) based on the current verse state.
 */
export class VerseInfoComponent extends UIComponent<"div"> {
  constructor(
    parent: HTMLElement,
    public verse: VerseRef,
    private app: TouchGrassBibleApp,
  ) {
    super(parent, "div");
    this.addClass("info-container");
    // Initial render can be empty; it will be populated via render() when the verse is active.
  }

  /**
   * Renders the info container's contents, including notes, bookmark buttons, and topic buttons.
   * Mirrors the logic from the original renderNoteArea, but encapsulated here.
   */
  render() {
    this.clearChildren(); // Clear previous contents to re-render

    for (const action of this.app.getVerseActions()) {
      new IconButton(this.element)
        .setIcon(action.icon)
        .setTooltip(action.name)
        .on("click", e => {
          e.stopPropagation();
          this.app.emit("verse-info-highlight", this.verse);
          this.initiateRenderReset();
          action.onTrigger(this);
        });
    }
  }

  private initiateRenderReset() {
    this.clearChildren();
    const reset = (e: Event) => {
      e.stopPropagation();
      // do not proceed if the click is inside the element
      if (this.element.contains(e.target as Node))
        return this.listenOn(document, "click", reset, { once: true });
      else this.initiateRenderReset(); // Clear and wait for next click to reset
      this.render(); // Re-render to restore original state
    };

    this.listenOn(document, "click", reset, { once: true });
  }
}
