# Core Source Files

This page covers the root-level `src/` files that define the app shell, Bible domain models, main reading experience, and root test/setup files.

## `src/AIchat.ts`

- Purpose: chat service for LLM requests and streamed responses
- Key APIs: `AIchat`, `request()`, `sendChatRequest()`, `handleStreamingResponse()`
- Keeps in-memory chat history with a built-in system prompt.
- Sends chat completion requests, defaulting to OpenAI-style APIs while supporting alternate headers.
- Parses streaming SSE responses and reconstructs assistant text and streamed tool calls.
- Depends on `src/external/MyBrowserConsole.ts`; mainly used by `src/plugins/AI.ts`.

## `src/BibleTopics.test.ts`

- Purpose: tests topic-to-verse mapping behavior
- Key APIs: Vitest coverage for `BibleTopics` and `VerseRef`
- Verifies topic creation, append, removal, deletion, and JSON round-tripping.
- Confirms missing topics return safe defaults.
- Checks reverse lookup with `getTopicsFromVerse()` and merge behavior with `addData()`.

## `src/BibleTopics.ts`

- Purpose: topic collection model keyed by verse OSIS references
- Key APIs: `BibleTopics`, `BibleTopicsType`
- Stores topic data as nested maps from topic name to OSIS string to numeric score.
- Converts between serialized topic data and `VerseRef` objects.
- Supports add, remove, delete, merge, reverse lookup, history grouping, and JSON export.
- Used by bookmarks and legacy settings fields in `src/TGAppSettings.ts`.

## `src/booksOfTheBible.ts`

- Purpose: canonical Bible book name tables
- Key APIs: `booksOfTheBible`, `BookShortNames`, `books3letter`
- Defines the 66-book order in uppercase full names.
- Provides short names and 3-letter codes for parsing and external URL generation.
- Used heavily by `src/VerseRef.ts`.

## `src/web/index.html`

- Purpose: source web HTML template used to generate the distributable shell
- Key elements: `#loadingScreen`, `#loading-text`, loading spinner markup
- Loaded by `esbuild.config.mjs` and written to `dist/index.html` with an injected CSP meta tag.
- Links runtime web assets (`main.css`, `main.js`, manifest, icons, service worker).
- Shows a startup loading overlay that `src/main.ts` removes after initialization.

## `src/electron/index.html`

- Purpose: Electron renderer HTML shell copied into the Electron `dist` output
- Key elements: `#loadingScreen`, `#loading-text`, loading spinner markup
- Loads renderer assets via `main.css` and `main.js` in the packaged Electron app.
- Used by `src/electron/electron.js` through `win.loadFile("index.html")`.

## `src/info.json`

- Purpose: application metadata document
- Key fields: `name`, `description`, `version`, `build`, `author`, `license`
- Supplies runtime-readable metadata.
- Imported by `src/main.ts` for startup logging and settings display.

## `src/main.css`

- Purpose: global app styling and reading layout CSS
- Key selectors: `body`, `.content .verse`, `.content .chapter`
- Defines theme variables, spacing, reading width, and shared UI tokens.
- Styles chapter and verse typography, numbering, spacing, and hover states.
- Styles the floating `CMD` button created in `src/main.ts`.

## `src/main.test.ts`

- Purpose: tests settings defaults and merge behavior
- Key APIs: local `isPlainObject()`, local `deepMerge()` used for assertions
- Verifies `DEFAULT_SETTINGS` shape and schema version.
- Mirrors `deepMerge()` from `src/main.ts` to test recursive merge behavior without exporting it.
- Covers nested objects, arrays, `undefined`, `null`, and unknown saved keys.

## `src/main.ts`

- Purpose: root app entry and main application class
- Key APIs: `TouchGrassBibleApp`, `app`, local `isPlainObject()`, local `deepMerge()`
- Boots the app, loads saved settings, and loads `[translations].json` into `VerseRef.bibleTranslations`.
- Registers workspace views and ensures the default reading layout exists.
- Installs internal plugins for bookmarks, TSK, search, topical browsing, notes, journal, translations, settings, AI, and sharing.
- Manages verse actions, palette opening, delayed settings persistence, and startup UI cleanup.

## `src/core/Plugin.ts`

- Purpose: plugin base classes and plugin manager
- Key APIs: `Plugin`, `InternalPlugins`, `IconActionItem`, grouped capabilities via `plugin.app`, `plugin.palette`, `plugin.commands`, `plugin.workspace`, and `plugin.files`
- Defines component lifecycle helpers like `load()`, `unload()`, child management, and cleanup registration.
- Keeps registration helpers (`registerPalette()`, `registerCommand()`, `registerView()`, `addVerseAction()`) focused on lifecycle-safe cleanup.
- Exposes grouped runtime capabilities so plugins can access app state, palette state, workspace control, command lookup, and file I/O without depending on the full app object shape.
- `InternalPlugins` manages plugin registration, duplicate ID protection, and lifecycle wiring.

## `src/Scroll.ts`

- Purpose: book and chapter scroll-bubble navigation wrappers
- Key APIs: `ChapterScroll`, `BookScroll`
- Wraps `ScrollBubble` to map scroll values to `VerseRef` targets.
- `ChapterScroll` navigates within the current book; `BookScroll` navigates across canonical books.
- Used by `src/VerseScreen.ts`.

## `src/sidepanels.ts`

- Purpose: navigation side-panel workspace view
- Key APIs: `NavigationPanel`
- Renders quick actions for Search, Notes, Bookmarks, and Menu.
- Opens the command palette pre-filtered to specific plugin category IDs.
- Registered by `src/main.ts` as the `navigation-panel` view.

## `src/test-setup.ts`

- Purpose: shared test environment setup
- Key APIs: global `String.prototype.toTitleCase`
- Declares and installs the `toTitleCase()` helper used by verse formatting tests.
- Supports `src/VerseRef.ts` expectations in Vitest.

## `src/TGAppSettings.test.ts`

- Purpose: smoke tests for default settings
- Key APIs: Vitest assertions over `DEFAULT_SETTINGS`
- Confirms the default font and schema version.
- Covers constants exported by `src/TGAppSettings.ts`.

## `src/TGAppSettings.ts`

- Purpose: persisted settings schema and defaults
- Key APIs: `DEFAULT_CATEGORY_ORDER`, `TGAppSettings`, `DEFAULT_SETTINGS`
- Defines app-level settings for logging, help visibility, style, and palette category ordering.
- Keeps deprecated note/bookmark fields for migration compatibility.
- Consumed by `src/main.ts` and settings-related tests.

## `src/VerseRef.test.ts`

- Purpose: tests verse reference parsing and formatting
- Key APIs: Vitest coverage for `VerseRef`
- Verifies default construction, OSIS parsing, range parsing, equality helpers, and display formatting.
- Confirms unknown OSIS codes fall back to `GENESIS 1:1`.

## `src/VerseRef.ts`

- Purpose: core Bible reference model and scripture access utility
- Key APIs: `VerseRef`, `bibleData`, `OSIS`, `translation`
- Represents a verse with helpers for formatting, equality, parsing, and OSIS conversion.
- Exposes canonical book metadata, translation storage, and a random verse helper.
- Reads verse, chapter, and book text from loaded translation data and computes navigation helpers.
- Generates external URLs for YouVersion, Blue Letter Bible, and Bible Gateway.

## `src/VerseScreen.css`

- Purpose: verse-screen specific styling
- Key selectors: `.icon-button`, `.info-container`, `.active .info-container`, `.content`
- Styles verse action buttons and the expandable info area for each verse.
- Adds highlight states for the active verse block and reading surface.
- Imported by `src/VerseScreen.ts`.

## `src/VerseScreen.ts`

- Purpose: main scripture reading workspace view
- Key APIs: `VerseHighlight`, `ChapterComponent`, `VerseScreen`, `VerseInfoComponent`
- Renders buffered chapters around the current verse and keeps scrolling smooth while navigating.
- Syncs palette state with the active verse and persists workspace view state.
- Uses book and chapter scroll overlays for fast navigation.
- Renders per-verse action buttons sourced from the plugin system.

## `src/__mocks__/external-App.stub.ts`

- Purpose: lightweight test stub for the external app layer
- Key APIs: re-export of `Highlighter`
- Gives tests a minimal substitute for heavier `external/App` imports.
- Points at `src/external/highlighter.ts` to isolate dependencies.
