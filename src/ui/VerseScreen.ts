import { IconActionItem } from "@touch-grass-bible";
import { highlight, HighlightRule, renderIcon, State, van, View } from "@touchgrass/framework";
import apocalypseThrottle from "apocalypse-throttle";
import TouchGrassBibleApp from "../main";
import { VerseRef, type translation } from "../models/VerseRef";
import { PinchZoomHandler } from "./pinchZoom";
import "./VerseScreen.css";

const { div, h2, i, b, span } = van.tags;

const VerseHighlightPatterns: HighlightRule[] = [
  { regEXP: /\[(.+?)\]/gi, callback: s => i(s) },
  { regEXP: /(LORD|God)/gi, callback: s => b(s) },
  { regEXP: /^(\d+)/gi, callback: s => span({ class: "number" }, s) },
  { regEXP: /#/gi, callback: () => span({ class: "paragraph-break" }, "\u00B6") },
];

type SerializedVerseScreenState = {
  verse: {
    book: string;
    chapter: number;
    verse: number;
  };
  translation?: translation;
};

type VerseScreenState = {
  verse: VerseRef;
  translation: translation;
};

export class VerseScreen extends View<VerseScreenState> {
  readonly viewTypeId = "verse-screen";
  chapters: HTMLElement[] = [];

  private scrollBubbleLifecycle: ScrollBubbleLifecycle | null = null;

  cacheStart: VerseRef | null = null;
  cacheEnd: VerseRef | null = null;

  minimumNumberOfScreensToCache = 20; // the number of screen hights worth of verses to cache above and below the current scroll position
  numberOfChaptersToLoadAtATime = 5; // when loading more chapters, load this many at a time to reduce the number of loads while scrolling
  maxChaptersToCache = 100; // the maximum number of chapters to keep in the DOM at once

  constructor(
    public app: TouchGrassBibleApp,
    public verseActions = van.state<IconActionItem[]>([]),
  ) {
    super("Verse Screen 2", { verse: app.verseState.val, translation: app.translationState.val });
    this.state.verse = this.app.commandPalette.useState(this.app.verseState.val);
    this.state.translation = this.app.commandPalette.useState<translation>(this.app.translationState.val);
    van.derive(() => (this.title.val = `${this.state.verse.val.toString()} - ${this.state.translation.val}`));
  }

  create(): HTMLElement {
    let isLoading = false;

    this.cacheStart = this.state.verse.val;
    this.cacheEnd = this.state.verse.val;
    this.scrollBubbleLifecycle = new ScrollBubbleLifecycle(this.state.verse);

    const listen = () => {
      const verse = this.state.verse.val;
      let foundInCache = false;

      let current = this.cacheStart;

      for (let i = 0; i < this.maxChaptersToCache; i++) {
        if (!current) break;
        if (verse.isSameChapter(current)) {
          foundInCache = true;
          break;
        }
        if (this.cacheEnd?.isSameChapter(current)) break;
        current = current.nextChapterIn(this.state.translation.val);
      }

      if (!foundInCache || this.state.translation.val !== this.state.translation.oldVal) {
        this.cacheStart = this.state.verse.val;
        this.cacheEnd = this.state.verse.val;
        this.el.replaceChildren(this.chapter(verse));
        this.loadMoreChapters("down");
        this.loadMoreChapters("up");
      }

      // Scroll to the verse after a short delay to ensure the DOM has updated with the new chapters if needed.
      setTimeout(() => {
        const scroll = this.el.scrollTop;
        this.el
          .querySelector(".verse-container.active")
          ?.scrollIntoView({ behavior: "instant", block: "start" });
        if (foundInCache && Math.abs(this.el.scrollTop - scroll) < window.innerHeight) {
          this.el.style.transform = `translateY(${this.el.scrollTop - scroll}px)`;
          requestAnimationFrame(() => {
            this.el.style.transition = "transform 0.3s ease";
            this.el.style.transform = "";
            setTimeout(() => (this.el.style.transition = ""), 300);
          });
        }
      });
      return "alive";
    };

    const pinchZoomHandler = new PinchZoomHandler(scale => {
      const size = this.app.setFontSize(scale, false, false);
      this.el
        .querySelector(".verse-container.active")
        ?.scrollIntoView({ behavior: "instant", block: "start" });
      return size;
    }, this.app.settings.style.fontSize);

    return div(
      {
        class: "screen-view content",
        style: "overflow: auto;",
        ontouchstart: pinchZoomHandler.handlePinchStart,
        ontouchmove: pinchZoomHandler.handlePinchMove,
        ontouchend: pinchZoomHandler.handlePinchEnd,
        ontouchcancel: pinchZoomHandler.handlePinchEnd,
        onscroll: (e: Event) => {
          if (isLoading) return;

          this.scrollBubbleLifecycle?.touch();

          isLoading = true;
          try {
            const target = e.currentTarget as HTMLElement;
            const { scrollTop, scrollHeight, clientHeight } = target;

            if (scrollTop < clientHeight * this.minimumNumberOfScreensToCache) {
              this.loadMoreChapters("up");
            } else if (
              scrollHeight - scrollTop - clientHeight <
              clientHeight * this.minimumNumberOfScreensToCache
            ) {
              this.loadMoreChapters("down");
            }
          } finally {
            setTimeout(() => (isLoading = false));
          }
        },
        dataset: listen,
      },
      this.chapter(this.state.verse.val),
    );
  }

  onUnmount(): void {
    this.scrollBubbleLifecycle?.destroy();
    this.scrollBubbleLifecycle = null;
  }

  chapter(ref: VerseRef) {
    return div(
      { class: () => "chapter" },
      h2(
        { class: () => `chapter-title${this.state.verse.val.isSameChap(ref) ? " active" : ""}` },
        `${ref.book} ${ref.chapter}`,
      ),
      ref
        .chapterData(this.state.translation.val)
        .slice(1)
        .map((text, v) => {
          const verse = new VerseRef(ref.book, ref.chapter, v + 1);
          return div(
            {
              class: () =>
                this.state.verse.val.isSame(verse) ? "active verse-container" : "verse-container",
            },
            div(
              {
                class: `verse${text?.includes("#") ? " paragraph-break" : ""}`,
                onclick: () => (this.state.verse.val = verse),
                oncontextmenu: (e: MouseEvent) => {
                  e.preventDefault();
                  this.app.verseState.val = verse;
                  this.app.openCommandPalette({ topCategory: "tsk-cross-ref" });
                },
              },
              highlight(`${v + 1} ${text}`, VerseHighlightPatterns),
            ),
            () =>
              this.state.verse.val.isSame(verse)
                ? div(
                    { class: "info-container" },
                    div(
                      { class: "buttons" },
                      this.verseActions.val
                        .filter(action => !action.isAvailable || action.isAvailable({ verse }))
                        .map(action =>
                          div(
                            {
                              class: "icon-button",
                              title: action.name,
                              onclick: (event: MouseEvent) => {
                                event.stopPropagation();
                                const element = ((event.currentTarget as HTMLElement)
                                  .closest(".info-container")
                                  ?.querySelector(".content-placeholder") ||
                                  event.currentTarget) as HTMLElement;
                                element.textContent = "";

                                element.focus();

                                action.onTrigger({ verse, event, element });
                                document.body.addEventListener(
                                  "click",
                                  (e: MouseEvent) => {
                                    e.stopPropagation();
                                    this.verseActions.val = [...this.verseActions.val]; // trigger reactivity to reset the buttons
                                  },
                                  { once: true },
                                );
                              },
                            },
                            renderIcon(action.icon),
                          ),
                        ),
                    ),
                    div({ class: "content-placeholder" }),
                  )
                : div(),
          );
        }),
    );
  }

  loadMoreChapters(direction: "up" | "down") {
    const current = direction === "up" ? this.cacheStart : this.cacheEnd;
    if (!current) return;

    const newChapters: HTMLElement[] = [];
    let nextRef: VerseRef | null = current;
    for (let i = 0; i < this.numberOfChaptersToLoadAtATime; i++) {
      nextRef =
        direction === "up"
          ? nextRef.prevChapterIn(this.state.translation.val)
          : nextRef.nextChapterIn(this.state.translation.val);
      newChapters.push(this.chapter(nextRef));
    }

    if (direction === "up") {
      this.el.prepend(...newChapters.reverse());
      this.cacheStart = nextRef;
    } else {
      this.el.append(...newChapters);
      this.cacheEnd = nextRef;
    }
    this.trimCache(direction);
  }

  trimCache(direction: "up" | "down") {
    const chapters = Array.from(this.el.children);
    if (chapters.length > this.maxChaptersToCache) {
      const excess = chapters.length - this.maxChaptersToCache;
      for (let i = 0; i < excess; i++) {
        if (direction === "up") {
          this.el.removeChild(chapters[chapters.length - 1 - i]);
          this.cacheEnd = this.cacheEnd?.prevChapterIn(this.state.translation.val) || null;
        } else {
          this.el.removeChild(chapters[i]);
          this.cacheStart = this.cacheStart?.nextChapterIn(this.state.translation.val) || null;
        }
      }
    }
  }

  serializeState(): string {
    return JSON.stringify({
      verse: {
        book: this.state.verse.val.book,
        chapter: this.state.verse.val.chapter,
        verse: this.state.verse.val.verse,
      },
      translation: this.state.translation.val,
    } satisfies SerializedVerseScreenState);
  }

  deserializeState(str: string): VerseScreenState {
    try {
      const state = JSON.parse(str) as SerializedVerseScreenState;
      const verse = new VerseRef(state.verse.book, state.verse.chapter, state.verse.verse);
      const translation = state.translation || this.state.translation.val;
      return { verse, translation };
    } catch (error) {
      this.app.console.error("Failed to deserialize VerseScreen state", error);
      return this.getState();
    }
  }
}

class ScrollBubbleLifecycle {
  private bubble: HTMLElement | null = null;
  private hideTimer: number | null = null;
  private isHolding = van.state(false);

  constructor(
    private verse: State<VerseRef>,
    private hideDelayMs = 3000,
    private mountTarget: HTMLElement = document.body,
  ) {}

  touch(): void {
    if (!this.bubble) {
      this.bubble = this.createBubble();
      this.mountTarget.appendChild(this.bubble);
    }

    if (this.isHolding.val) return;

    if (this.hideTimer !== null) {
      window.clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }

    this.hideTimer = window.setTimeout(() => {
      this.hideTimer = null;
      this.removeBubble();
    }, this.hideDelayMs);
  }

  destroy(): void {
    if (this.hideTimer !== null) {
      window.clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
    this.removeBubble();
  }

  private removeBubble(): void {
    this.bubble?.remove();
    this.bubble = null;
  }

  private createBubble(): HTMLElement {
    const dragVerse = van.state(this.verse.val);
    let isDragging = false;

    const onpointerdown = (e: PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();

      isDragging = true;
      this.isHolding.val = true;
      if (this.hideTimer !== null) {
        window.clearTimeout(this.hideTimer);
        this.hideTimer = null;
      }
      dragVerse.val = this.verse.val;

      const height = window.innerHeight;
      const width = window.innerWidth;

      const sections = 4;

      const sectionPositions = new Array(sections).fill(0);

      const pointermove = apocalypseThrottle((moveEvent: PointerEvent) => {
        const y = moveEvent.clientY / 0.8 - height * 0.1; // allow dragging slightly above the bubble for easier use
        const x = moveEvent.clientX;
        const csection = Math.max(0, Math.min(sections - 1, Math.floor((1 - x / width) * sections)));
        sectionPositions[csection] = y / height - 0.5;
        for (let i = csection + 1; i < sections; i++) if (i !== csection) sectionPositions[i] = 0;
        const distance =
          0.5 + sectionPositions.reduce((acc, newVal, idx) => acc + (newVal || 0) / Math.pow(4, idx), 0);

        const ref = VerseRef.distance(distance);
        ref.verse = 1;

        dragVerse.val = ref;
      }, 50);

      const pointerup = () => {
        isDragging = false;
        this.isHolding.val = false;
        this.verse.val = dragVerse.val;
        document.body.removeEventListener("pointermove", pointermove);
        this.touch();
      };

      document.body.addEventListener("pointermove", pointermove);
      document.body.addEventListener("pointerup", pointerup, { once: true });
      document.body.addEventListener("pointercancel", pointerup, { once: true });
      document.body.addEventListener("pointerleave", pointerup, { once: true });
    };

    return div(
      {
        class: "scroll-bubble",
        style: () => `top: ${10 + dragVerse.val.getDistance() * 80}vh`,
        onpointerdown,
      },
      span(
        {
          class: () =>
            this.isHolding.val ? "scroll-bubble-label scroll-bubble-label-visible" : "scroll-bubble-label",
        },
        () => dragVerse.val.toString(),
      ),
      span({
        class: "scroll-bubble-handle",
        "aria-hidden": "true",
        dataset: () => !isDragging && (dragVerse.val = this.verse.val),
      }),
    );
  }
}
