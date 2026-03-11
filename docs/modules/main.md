# `TouchGrassBibleApp` — Main Application

**File:** `src/main.ts`  
**Class:** `TouchGrassBibleApp extends App`  
**Exported as:** default export + singleton `export const app`

---

## Purpose

`TouchGrassBibleApp` is the application entry point and top-level coordinator. It:
- Extends the `App` base class from `src/external/App.ts`
- Instantiates and loads all feature plugins
- Registers all workspace views
- Manages settings and Bible data lifecycle
- Provides the verse state and translation state for the entire app

---

## Exported Singleton

```typescript
export const app = new TouchGrassBibleApp(document);
```

This singleton is instantiated at module load time. The `App` constructor immediately schedules `onload()` for `DOMContentLoaded`, so the app initializes as soon as the page is ready.

---

## Properties

| Property | Type | Description |
|----------|------|-------------|
| `settings` | `TGAppSettings` | Loaded user settings (merged with defaults) |
| `verseState` | `PaletteState<VerseRef>` | Currently displayed verse (reactive) |
| `defaultTranslation` | `PaletteState<translation>` | Active Bible translation (reactive) |
| `Notes` | `NoteVault` | Vault for free-form notes not tied to a verse |
| `firstLoad` | `boolean` | True until the command palette is first opened |
| `saveTimeoutId` | `ReturnType<typeof setTimeout> \| null` | Timer for debounced settings save |
| `verseActions` | `Map<string, IconActionItem>` | (private) All registered verse action buttons |

All of the re-exported items from `src/external/App`, `src/TGAppSettings`, `src/VerseRef`, and `src/VerseScreen` are accessible via imports from `"./main"`.

---

## Initialization Sequence (`onload`)

```typescript
async onload() {
  // 1. Set up workspace DOM host element
  this.initializeWorkspaceHost();

  // 2. Arrow right key navigates to navigation panel
  this.on("ArrowRightKeyDown", () => this.workspace.activateView("navigation-panel"));

  // 3. Keep VerseRef.defaultTranslation in sync with state
  this.defaultTranslation.onChange(t => (VerseRef.defaultTranslation = t));

  // 4. Load & merge user settings from localStorage
  await this.loadsettings(DEFAULT_SETTINGS);

  // 5. Restore workspace panel/tab layout
  await this.loadWorkspaceLayout();

  // 6. Register all workspace view factories
  this.registerWorkspaceViews();

  // 7. Ensure the main VerseScreen tab exists in the layout
  this.ensureMainScreenTab();

  // 8. Auto-save workspace layout on panel changes
  this.enableWorkspaceAutoSave();

  // 9. Load any free-form ExtraNotes
  this.Notes.loadNotes(this.settings.ExtraNotes.map(nj => Note.fromJSON(nj)));

  // 10. Fetch translations.json and load into VerseRef
  const translations = await this.loadJSON<...>("translations.json");
  VerseRef.bibleTranslations = translations;

  // 11. Set responsive columns on the command palette
  this.commandPalette.columns = this.contentEl.offsetWidth > 800;
  window.addEventListener("resize", () => { /* update columns on resize */ });

  // 12. Initialize bookmarks from saved settings
  VerseRef.Bookmarks = new BibleTopics(this.settings.Bookmarks);

  // 13. Set starting verse to a random verse
  this.verseState.set(VerseRef.RandomVerse);

  // 14. Global keyboard shortcut: Ctrl+Enter opens palette
  this.on("Ctrl+EnterKeyDown", () => !this.commandPalette.isOpen && this.openCommandPalette());

  // 15. Load all plugins in sequence
  new BookmarkPlugin(this, {...}).load();
  new TSK(this, {...}).load();
  new BibleSearchPlugin(this, {...}).load();
  new TopicalBiblePlugin(this, {...}).load();
  new NotesPlugin(this, {...}).load();
  new TranslationsPlugin(this, {...}).load();
  new SettingsPlugin(this, {...}).load();
}
```

---

## Methods

### `openCommandPalette(state?)`

```typescript
openCommandPalette(state: Partial<CommandPaletteState> = {}): void
```

Opens the command palette, optionally setting initial state. Also handles the `showHelp` first-load flag.

### `onunload()`

```typescript
onunload(): boolean
```

Called by `window.beforeunload`. Saves the workspace layout and returns `true` to allow the page to close.

### `loadsettings(defaults)`

```typescript
async loadsettings(DEFAULT_SETTINGS: TGAppSettings)
```

Merges saved `localStorage` data with the provided defaults using `Object.assign`. Also restores `VerseRef.myNotes` from the saved notes map.

### `saveSettings()`

```typescript
saveSettings(): void
```

Serializes bookmarks and notes back from the in-memory `VerseRef` statics into `settings`, then calls `saveData()`.

### `saveSettingsAfterDelay(delay?)`

```typescript
saveSettingsAfterDelay(delay: number = 5000): void
```

Debounced settings save. Cancels any pending save, then reschedules for `delay` ms in the future. Prevents excessive localStorage writes during rapid user actions.

### `addVerseAction(action)` / `removeVerseAction(id)` / `getVerseActions()`

Manage the registry of icon buttons shown on verse displays. Plugins call `addVerseAction` during their `onload`, and the cleanup is registered automatically via `registerUnload`.

---

## Workspace Views Registered

| View ID | Class | Description |
|---------|-------|-------------|
| `verse-screen` | `VerseScreen` | Main Bible reading view |
| `reading-tools` | `View` (static) | Info panel with usage tips |
| `navigation-panel` | `navigationPanel` | Book/chapter sidebar |
| `notes-panel` | `NotesPanel` | Personal notes panel |

---

## Default Workspace Layout

```typescript
{
  rootPanel: {
    mode: "panels",          // Split container
    splitDirection: "horizontal",
    children: [
      {
        size: 3,
        panel: {
          mode: "views",     // Tab bar
          views: [
            { id: "verse-screen", title: "Scripture" },
            { id: "reading-tools", title: "Tools" },
          ]
        }
      },
      {
        size: 2,
        panel: {
          mode: "views",
          views: [
            { id: "navigation-panel", title: "Navigate" },
            { id: "notes-panel", title: "Notes" },
          ]
        }
      }
    ]
  }
}
```

---

## Re-exports

`main.ts` re-exports from several modules so that plugins only need to import from `"./main"`:

```typescript
export * from "./external/App";     // All framework classes
export * from "./TGAppSettings";    // Settings types
export * from "./VerseRef";         // Verse reference model
export * from "./VerseScreen";      // VerseScreen + VerseInfoComponent
```
