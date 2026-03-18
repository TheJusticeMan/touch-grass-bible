# Plugin Files

This page covers the feature layer under `src/plugins/`, where most user-facing behaviors are packaged as plugins that register command-palette categories, verse actions, and workspace views.

## `src/plugins/AI.ts`

- Purpose: AI-assisted verse explanation and question answering
- Key APIs: `AIPlugin`, internal `AICommandPalette`, `AIPluginSettings`, `defaultAISettings`
- Registers the AI palette category and stores an API key in plugin settings.
- Adds a verse action that asks `AIchat` to explain the selected verse in context.
- Redirects users toward Settings when no API key is configured.

## `src/plugins/Bookmarks.test.ts`

- Purpose: tests bookmark date-label formatting logic
- Key APIs: local `getLocalDateStrings()`, `convertTopicDate()` helper
- Recreates the date labeling behavior from the bookmark plugin in isolation.
- Verifies `Today`, `Yesterday`, recent dates, older dates, and non-date labels.

## `src/plugins/Bookmarks.ts`

- Purpose: bookmark management and bookmark browsing
- Key APIs: `BookmarkPlugin`, internal `VerseListCategory`, internal `BookmarkCategory`, `BookmarkSettings`, `defaultBookmarks`
- Loads bookmark data into `BibleTopics` and migrates older storage formats.
- Adds verse actions for adding or removing the current verse from tags.
- Registers categories for tag browsing and verse lists inside a selected tag.
- Routes selected bookmark verses into the TSK cross-reference flow.

## `src/plugins/categoryIDs.ts`

- Purpose: shared command-palette category ID constants
- Key APIs: `AICategoryID`, `BibleSearchCategoryID`, `BookmarkCategoryID`, `GoToVerseCategoryID`, `myNotesCategoryID`, `SettingsCategoryID`, `TopicListCategoryID`, `TranslationsCategoryID`, `TSKCrossRefCategoryID`, `VerseListCategoryID`
- Centralizes the string IDs used across plugins.
- Reduces duplicated hardcoded category names and keeps palette navigation consistent.

## `src/plugins/Journal/Journal.ts`

- Purpose: journal plugin and reading-history logging
- Key APIs: `JournalPlugin`, internal `JournalCategory`, `JournalSettings`, `defaultJournalSettings`
- Registers the `journal-panel` workspace view and tracks open panel instances.
- Registers an `Open Journal` palette command.
- Watches verse changes and appends reading-history entries via `JournalStorage`.

## `src/plugins/Journal/index.ts`

- Purpose: folder entry point for the journal plugin
- Key APIs: default re-export of `./Journal`
- Allows imports from the folder root instead of the concrete file path.

## `src/plugins/Journal/journal-storage.ts`

- Purpose: journal persistence layer
- Key APIs: `JournalStorage`, `JournalEntry`, `JournalDay`
- Stores data under `journal/index.json` plus daily files like `journal/YYYY-MM-DD.json`.
- Creates missing days, appends text or verse entries, and finds previous journal days.
- Used by `src/plugins/Journal/Journal.ts` and `src/plugins/Journal/JournalPanel.ts`.

## `src/plugins/Journal/JournalPanel.css`

- Purpose: journal panel styling
- Key selectors: `.journal-panel`, `.journal-stream`, `.journal-day`, `.journal-entry`, `.journal-composer`
- Defines the layout for the journal stream, sticky day headers, and composer area.
- Distinguishes verse-reference entries from freeform text entries.

## `src/plugins/Journal/JournalPanel.ts`

- Purpose: journal workspace view UI
- Key APIs: `JournalPanel`, local `formatDayHeader()`, local `formatEntryTime()`
- Renders the journal shell, append-only toggle, status text, and composer.
- Loads recent entries first and lazy-loads older days as the user scrolls upward.
- Saves new entries through `JournalStorage` and reacts to live updates from the plugin.

## `src/plugins/Notes/Notes.ts`

- Purpose: verse-linked notes and note vault management
- Key APIs: `NotesPlugin`, `OSISNotes`, internal `myNotesCategory`, `NotesPluginSettings`, `defaultNotesSettings`
- Loads verse notes and freeform vault notes from plugin settings.
- Registers the notes palette category and the `notes-panel` workspace view.
- Adds a verse action for editing the current verse's personal note inline.

## `src/plugins/Notes/NotesPanel.css`

- Purpose: notes panel styling
- Key selectors: `.notes-panel`, `.note-preview`, `.corner-button`, `.editor-overlay`, `.note-editor-textarea`, `.tag-badge`
- Styles note cards, the floating add button, tag badges, and the full-screen editor overlay.
- Supports the UI defined in `src/plugins/Notes/NotesPanel.ts`.

## `src/plugins/Notes/NotesPanel.ts`

- Purpose: standalone notes panel and note editor UI
- Key APIs: `Note`, `NoteVault`, `NotesPanel`
- Defines the note model and vault container used by the notes plugin.
- Renders searchable note previews, sorting, and note creation flows.
- Includes editor and tag-management helpers that save back through `NotesPlugin`.

## `src/plugins/Search.ts`

- Purpose: full-text Bible search and go-to-verse navigation
- Key APIs: `BibleSearchPlugin`, internal `BibleSearchCategory`, internal `GoToVerseCategory`, `BibleMatch`
- Registers one category for full-text search and another for structured verse lookup.
- Parses book/chapter/verse input incrementally and returns `VerseRef` results.
- Routes selections into the TSK cross-reference category.

## `src/plugins/Settings.ts`

- Purpose: settings UI through the command palette
- Key APIs: `SettingsPlugin`, internal `SettingsCategory`
- Registers the settings category.
- Adds commands for logging, download/upload of settings JSON, and reset behavior.
- Shows app metadata and keyboard-help items.

## `src/plugins/Share.ts`

- Purpose: external verse sharing actions
- Key APIs: `SharePlugin`
- Registers a verse action that opens the current verse in external sites.
- Uses `VerseRef` URL helpers for YouVersion, Blue Letter Bible, and Bible Gateway.

## `src/plugins/TopicalBible.ts`

- Purpose: topical Bible browsing
- Key APIs: `TopicalBiblePlugin`, internal `topicListCategory`
- Loads `topics.json` into `BibleTopics`.
- Adds a verse action showing topics linked to the current verse.
- Registers a category that can show all topics or the verses for the selected topic.

## `src/plugins/Translations.ts`

- Purpose: translation switching
- Key APIs: `TranslationsPlugin`, `translationMetadata`, internal `translationCategory`
- Registers the translations category and exposes friendly labels for each translation.
- Syncs palette state into `VerseRef.defaultTranslation`.
- Reads available translations from `VerseRef.bibleTranslations`.

## `src/plugins/TSK.ts`

- Purpose: Treasury of Scripture Knowledge cross-reference browsing
- Key APIs: `TSK`, internal `CrossRefCategory`
- Loads `crossrefs.json` and keeps an in-memory OSIS cross-reference map.
- Adds a verse action and palette category for cross references.
- Serves as a navigation hub for bookmarks, notes, search, and topical browsing.
