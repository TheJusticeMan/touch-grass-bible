import apocalypseThrottle from "apocalypse-throttle";
import { Bookmark, GitCompare, Plus, ScrollText, SquarePen, Waypoints } from "lucide";
import TouchGrassBibleApp, {
  Button,
  Component,
  CrossRefCategory,
  Highlighter,
  IconButton,
  pdsp,
  ScreenView,
  TextArea,
  TextInput,
  topicListCategory,
  VerseHighlight,
  VerseListCategory,
  VerseRef,
} from "./main";
import { BookScroll, ChapterScroll } from "./Scroll";
import "./VerseScreen.css";

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
  verse: VerseRef;
  verses: HTMLDivElement[] = [];
  verseInfos: VerseInfoComponent[] = []; // New: Array of components instead of raw elements

  constructor(parent: HTMLElement, ref: VerseRef, private app: TouchGrassBibleApp) {
    super(parent, "div");
    this.verse = ref;
    const h: Highlighter["highlight"] = VerseHighlight.highlight.bind(VerseHighlight);
    const { book, chapter } = ref;
    this.element.addClass("chapter");
    this.element.createEl("h2", { text: h(ref.toChaperString()), cls: "chapterTitle" });
    ref.cTXT.forEach((text: string, v: number) => {
      if (v === 0) return;
      const newVerse = new VerseRef(book, chapter, v);
      this.verses[v] = this.element.createEl("div", {}, (el: HTMLElement) => {
        el.createEl("div", { text: h(`${v} ${text}`), cls: "verse" }, (el: HTMLElement) => {
          if (text.includes("#")) el.addClass("versePBreak");

          el.addEventListener("click", () => (this.app.MainScreen.verse = newVerse));
          el.addEventListener(
            "contextmenu",
            pdsp(() => this.app.openCommandPalette({ topCategory: CrossRefCategory, verse: newVerse }))
          );
        });
        // Replace raw div creation with the new component
        this.verseInfos[v] = new VerseInfoComponent(el, newVerse, this.app);
      });
    });
  }

  removeActive() {
    this.element.querySelector(".verseActive")?.classList.remove("verseActive");
  }

  setActive(verse: VerseRef) {
    this.verses[verse.verse]?.classList.add("verseActive");
    this.verseInfos[verse.verse]?.render(); // Render the info container when active
  }

  scrollTo(verse: VerseRef) {
    this.removeActive();
    this.verses[verse.verse]?.scrollIntoView({ behavior: "smooth", block: "start" });
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

    this.on(
      "menuclick",
      pdsp(() => this.app.commandPalette.menu())
    );

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
    this._verse = value;
    this.app.commandPalette.state.verse = value;
    this.updateTitle();
    if (!this.chapterScroll?.isGrabbed && !this.bookScroll?.isGrabbed)
      VerseRef.Bookmarks.addToHistory(this.verse);
    this.chapterScroll?.setRef(value);
    this.bookScroll?.setRef(value);

    if (!this.renderedChapters.some(c => c.verse.isSameChapter(value))) {
      this.renderInitialChapters();
    } else {
      this.highlightVerse(false);
    }
  }

  updateTitle() {
    this.title = this._verse.toString();
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

  removeActive() {
    this.renderedChapters.forEach(c => c.removeActive());
  }

  highlightVerse(instant = false) {
    this.removeActive();
    const component = this.renderedChapters.find(c => c.verse.isSameChapter(this._verse));
    if (component) {
      if (instant) {
        component.scrollToInstant(this._verse);
      } else {
        component.scrollTo(this._verse);
      }
    }
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
    if (!v.isSameChapter(this._verse)) this.title = v.toChaperString();
    else this.updateTitle();
    return this;
  }
}

/**
 * A component for displaying and managing verse-specific information (e.g., notes, bookmarks, topics).
 * Encapsulates the logic for rendering an info container below each verse.
 *
 * This replaces the raw `infoContainer[v]` div and the `renderNoteArea` method,
 * promoting reusability and modularity. It handles dynamic rendering of notes (as a textarea),
 * bookmarks, and topics based on the provided VerseRef.
 *
 * @extends Component<"div">
 *
 * @property verse - The VerseRef associated with this info container.
 * @property app - The main TouchGrassBibleApp instance for navigation and state management.
 *
 * @method render - Updates and renders the info container's contents (notes, buttons) based on the current verse state.
 */
export class VerseInfoComponent extends Component<"div"> {
  constructor(parent: HTMLElement, private verse: VerseRef, private app: TouchGrassBibleApp) {
    super(parent, "div");
    this.addClass("infoContainer");
    // Initial render can be empty; it will be populated via render() when the verse is active.
  }

  /**
   * Renders the info container's contents, including notes, bookmark buttons, and topic buttons.
   * Mirrors the logic from the original renderNoteArea, but encapsulated here.
   */
  render() {
    this.element.empty(); // Clear previous contents to re-render

    const { topicList } = this.verse;

    // Handle note input: Show textarea if note exists, otherwise show a button to add one.
    new IconButton(this.element).setIcon(SquarePen).on("click", e => {
      e.stopPropagation();
      this.initiateRenderReset();
      const noteInput = new TextArea(this.element)
        .setValue(this.verse.note || "")
        .addClass("noteArea")
        .setPlaceholder(" - Add your note here...")
        .on("click", e => e.stopPropagation())
        .on("input", (value: string) => {
          this.verse.note = value;
          this.app.saveSettingsAfterDelay();
        });
      noteInput.focus(); // Auto-focus for better UX
    });
    new IconButton(this.element).setIcon(ScrollText).on("click", () => {
      this.initiateRenderReset();
      const links = [
        { name: "YouVersion", url: this.verse.YouVersionURL },
        { name: "Blue Letter Bible", url: this.verse.blbURL },
        { name: "Bible Gateway", url: this.verse.gatewayURL },
      ];
      links.forEach(link => {
        new Button(this.element).setButtonText(`Open in ${link.name}`).on("click", e => {
          e.stopPropagation();
          window.open(link.url, "_blank");
        });
      });
    });

    // Handle bookmarks: Show buttons for each bookmark date.
    new IconButton(this.element).setIcon(Bookmark).on("click", () => {
      this.initiateRenderReset();
      this.syncBookmarkStatus();
    });

    // Handle topics: Show buttons for each topic if any exist.
    if (topicList.length > 0) {
      new IconButton(this.element).setIcon(GitCompare).on("click", () => {
        // On click, expand to show topic buttons (replacing the chevron)
        this.initiateRenderReset();
        topicList.forEach(topic => {
          new Button(this.element).setButtonText(`${topic.toTitleCase()}`).on("click", () => {
            this.app.openCommandPalette({ topCategory: topicListCategory, topic: topic });
          });
        });
        // Optionally, add a way to collapse back, but for simplicity, keep it expanded.
      });
    }
    new IconButton(this.element).setIcon(Waypoints).on("click", () => {
      this.app.openCommandPalette({ topCategory: CrossRefCategory, verse: this.verse });
    });
  }

  private syncBookmarkStatus() {
    const { bookmarkList: usedTags } = this.verse;
    this.element.empty();
    const unusedTags = VerseRef.Bookmarks.keys.filter(tag => !usedTags.includes(tag));

    usedTags.forEach(topic => {
      new Button(this.element)
        .setButtonText(`${VerseListCategory.convertTopicDate(topic)}`)
        .addClass("bookmarkAdded")
        .on("click", () => {
          VerseRef.Bookmarks.remove(topic, this.verse);
          this.syncBookmarkStatus();
        })
        .on("menu", e => {
          e.stopPropagation();
          this.app.openCommandPalette({ topCategory: VerseListCategory, tag: topic });
        });
    });
    // add new tag button
    new IconButton(this.element).setIcon(Plus).on("click", () => {
      this.initiateRenderReset();
      let tag = "";
      this.verse.bookmarkList.length;
      const addBookmark = () => {
        if (tag.length === 0) return;
        VerseRef.Bookmarks.add(tag, this.verse);
        this.syncBookmarkStatus();
      };

      new TextInput(this.element)
        .setPlaceholder("Enter bookmark name...")
        .addClass("noteArea")
        .on("click", e => e.stopPropagation())
        .on("input", (value: string) => (tag = value.trim()))
        .on("keydown", e => (e as KeyboardEvent).key === "Enter" && addBookmark());

      new Button(this.element).setButtonText("Add").on("click", () => addBookmark());
    });
    if (unusedTags.length > 0) this.element.createEl("hr");
    unusedTags.forEach(topic => {
      new Button(this.element)
        .setButtonText(`${VerseListCategory.convertTopicDate(topic)}`)
        .addClass("bookmarkNotAdded")
        .on("click", () => {
          VerseRef.Bookmarks.add(topic, this.verse);
          this.syncBookmarkStatus();
        })
        .on("menu", e => {
          e.stopPropagation();
          this.app.openCommandPalette({ topCategory: VerseListCategory, tag: topic });
        });
    });
  }

  private initiateRenderReset() {
    this.element.empty();
    const reset = (e: Event) => {
      e.stopPropagation();
      // do not proceed if the click is inside the element
      if (this.element.contains(e.target as Node))
        return document.addEventListener("click", reset, { once: true });
      this.render(); // Re-render to restore original state
    };

    document.addEventListener("click", reset, { once: true });
  }
}
