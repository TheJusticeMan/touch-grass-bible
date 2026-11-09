# Plugin Files

This page covers the feature layer under `src/plugins/`, where most user-facing behaviors are packaged as plugins that register command-palette categories, verse actions, and workspace views.

## `src/plugins/AI/AI.ts`

- Purpose: current AI plugin implementation entrypoint
- Key APIs: `AIPlugin`, AI category wiring, verse explain action handlers
- Integrates the AI chat and embedding-search utilities under the plugin namespace.

## `src/plugins/AI/AIchat.ts`

- Purpose: chat request/stream client used by the AI plugin.

## `src/plugins/AI/AIEmbeddingSearch.ts`

- Purpose: semantic embedding search integration for AI-assisted lookup.

## `src/plugins/AI/AIEmbeddingSearchDB.ts`

- Purpose: embedding index/data access helpers for AI search flows.

## `src/plugins/AI/index.ts`

- Purpose: AI plugin module exports.

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

- Purpose: timeline-style journaling with text and verse-linked entries
- Key APIs: `JournalPlugin`, `JournalCategoryID`, `JournalViewID`, internal `JournalPanel`
- Registers the `journal-panel` workspace view and persists grouped journal data in plugin settings.
- Adds a verse action for creating journal entries from the currently selected verse.
- Supports inline text editing, verse previews, and context-menu removal for existing entries.

## `src/plugins/Journal/Journal.css`

- Purpose: journal panel styling
- Key selectors: `.journal-panel`, `.day-group`, `.entry`, `.add-button`, `.time`
- Styles grouped daily entries, editable text/verse cards, and action buttons used by the journal view.
- Supports the UI defined in `src/plugins/Journal/Journal.ts`.

## `src/plugins/Journal/index.ts`

- Purpose: Journal plugin export surface.

## `src/plugins/Notes/Notes.ts`

- Purpose: verse-linked notes and note vault management
- Key APIs: `NotesPlugin`, `OSISNotes`, internal `myNotesCategory`, `NotesPluginSettings`, `defaultNotesSettings`
- Loads verse notes and freeform vault notes from plugin settings.
- Registers the notes palette category and the `notes-panel` workspace view.
- Adds a verse action for editing the current verse's personal note inline.

## `src/plugins/Notes/NotesPanel.css`

- Purpose: notes panel styling
- Key selectors: `.notes-panel`, `.note-preview`, `.editor-overlay`, `.note-editor-textarea`, `.tag-badge`
- Styles note cards, the floating add button, tag badges, and the full-screen editor overlay.
- Supports the UI defined in `src/plugins/Notes/NotesPanel.ts`.

## `src/plugins/Notes/NotesPanel.ts`

- Purpose: standalone notes panel and note editor UI
- Key APIs: `Note`, `NoteVault`, `NotesPanel`
- Defines the note model and vault container used by the notes plugin.
- Renders searchable note previews, sorting, and note creation flows.
- Includes editor and tag-management helpers that save back through `NotesPlugin`.

## `src/plugins/Notes/index.ts`

- Purpose: Notes plugin export surface.

## `src/plugins/Search.ts`

- Purpose: full-text Bible search and go-to-verse navigation
- Key APIs: `BibleSearchPlugin`, internal `BibleSearchCategory`, internal `GoToVerseCategory`, `BibleMatch`
- Registers one category for full-text search and another for structured verse lookup.
- Parses book/chapter/verse input incrementally and returns `VerseRef` results.
- Routes selections into the TSK cross-reference category.

## `src/plugins/Search.test.ts`

- Purpose: tests for Bible search/query parsing behavior.

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

## `src/plugins/NavesTopicalBible/NavesTopicalBible.ts`

- Purpose: Nave's topical index plugin implementation.

## `src/plugins/NavesTopicalBible/NavesTopicalBibleData.ts`

- Purpose: Nave data parsing/lookup helpers.

## `src/plugins/NavesTopicalBible/NavesTopicalBibleData.test.ts`

- Purpose: tests for Nave topical data behavior.

## `src/plugins/NavesTopicalBible/index.ts`

- Purpose: Nave plugin export surface.

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

## `src/plugins/Appearance.ts`

- Purpose: appearance/theme-oriented plugin commands and settings hooks.

## `src/plugins/BibleMap/BibleMapPlugin.ts`

- Purpose: map-focused plugin entrypoint for Bible geography features.

## `src/plugins/BibleMap/BibleMapView.ts`

- Purpose: workspace view implementation used by the Bible map plugin.

## `src/plugins/BibleMap/BibleMap.css`

- Purpose: map view styling.

## `src/plugins/GestureCommands/GestureCommands.ts`

- Purpose: gesture-based command integrations for mobile/touch input.

## `src/plugins/GestureCommands/GestureCommands.css`

- Purpose: gesture command UI styling.

## `src/plugins/GestureCommands/index.ts`

- Purpose: gesture plugin export surface.

## `src/plugins/searchParser.ts`

- Purpose: shared parsing utilities used by search-related plugins.

## `src/plugins/index.ts`

- Purpose: plugin module barrel exports for app startup registration.
