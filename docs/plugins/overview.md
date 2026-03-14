# Plugins Overview

Touch Grass Bible's features are implemented as plugins extending the `Plugin` base class. Each plugin registers command palette categories, verse action buttons, and/or workspace views.

---

## All Plugins at a Glance

| Plugin                                | ID              | File              | Palettes                      | Verse Actions            |
| ------------------------------------- | --------------- | ----------------- | ----------------------------- | ------------------------ |
| [BookmarkPlugin](Bookmarks.md)        | `bookmarks`     | `Bookmarks.ts`    | `bookmarks`, `verse-list`     | Bookmark icon, List icon |
| [TSK](TSK.md)                         | `tsk`           | `TSK.ts`          | `tsk-cross-ref`               | Cross-ref icon           |
| [BibleSearchPlugin](Search.md)        | `bible-search`  | `Search.ts`       | `bible-search`, `go-to-verse` | —                        |
| [TopicalBiblePlugin](Topics.md)       | `topical-bible` | `TopicalBible.ts` | `topics`                      | Topics icon              |
| [NotesPlugin](Notes.md)               | `notes`         | `Notes.ts`        | `my-notes`                    | Notes icon               |
| [TranslationsPlugin](Translations.md) | `translations`  | `Translations.ts` | `translations`                | —                        |
| [SettingsPlugin](Settings.md)         | `settings`      | `Settings.ts`     | `settings`                    | —                        |

---

## Loading Order

Plugins are loaded in sequence in `TouchGrassBibleApp.onload()`:

```typescript
new BookmarkPlugin(this, {...}).load();
new TSK(this, {...}).load();
new BibleSearchPlugin(this, {...}).load();
new TopicalBiblePlugin(this, {...}).load();
new NotesPlugin(this, {...}).load();
new TranslationsPlugin(this, {...}).load();
new SettingsPlugin(this, {...}).load();
```

TSK and TopicalBible load external JSON data asynchronously during their `onload()`.

---

## Command Palette Category Map

When the palette opens, the default view (`menu()`) shows all registered categories. Categories are displayed in the order they were registered.

```
Command Palette Menu
├── Search Bible                (BibleSearchPlugin)
├── Go to Verse                 (BibleSearchPlugin)
├── Bookmarks                   (BookmarkPlugin)
│   └── [Current Bookmark Tag] (BookmarkPlugin - verse-list)
├── TSK+ Cross References       (TSK)
├── Topics                      (TopicalBiblePlugin)
├── My Notes                    (NotesPlugin)
├── Translations                (TranslationsPlugin)
└── Settings                    (SettingsPlugin)
```

---

## Verse Action Buttons

When a verse is selected (active), the `VerseInfoComponent` renders action buttons registered by plugins:

| Action ID       | Plugin             | Icon       | Effect                        |
| --------------- | ------------------ | ---------- | ----------------------------- |
| `bookmark`      | BookmarkPlugin     | Bookmark   | Opens bookmark tag selector   |
| `tsk-cross-ref` | TSK                | GitCompare | Opens cross-reference palette |
| `topics`        | TopicalBiblePlugin | Waypoints  | Opens topic list for verse    |
| `notes`         | NotesPlugin        | SquarePen  | Opens note editor for verse   |
| `verse-list`    | BookmarkPlugin     | ScrollText | Opens verse list              |

Plus a built-in "Open in..." button (YouVersion, Blue Letter Bible, Bible Gateway).

---

## Plugin Development

See [architecture/plugin-system.md](../architecture/plugin-system.md) for full documentation on creating new plugins.
