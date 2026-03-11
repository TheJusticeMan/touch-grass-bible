# `navigationPanel` — Sidebar Navigation

**File:** `src/sidepanels.ts`  
**Class:** `navigationPanel`

---

## Purpose

The `navigationPanel` is the left sidebar panel in the workspace. It provides quick access shortcuts to the most common command palette categories via large, tappable list items — designed to be finger-friendly on mobile.

---

## Layout

```
[Search]      → Opens Bible Search category
[Notes]       → Opens My Notes category
[Bookmarks]   → Opens Bookmarks category
[Menu]        → Opens full command palette menu
```

Each item is an `Item` component (from `src/external/Components.ts`) with a click handler that opens the command palette to a specific category.

---

## Class Details

**Extends:** `View` (workspace view)

```typescript
class navigationPanel extends View {
  content: HTMLDivElement;
  constructor(panel: Panel, app: TouchGrassBibleApp)
  updateContent(): void
}
```

### `updateContent()`

Rebuilds the panel content by creating four `Item` components:

| Item | Opens Category |
|------|---------------|
| Search | `BibleSearchCategoryID` (`"bible-search"`) |
| Notes | `myNotesCategoryID` (`"my-notes"`) |
| Bookmarks | `BookmarkCategoryID` (`"bookmarks"`) |
| Menu | `app.commandPalette.menu()` (top-level palette) |

---

## Navigation Shortcut

In the main app, the `ArrowRight` key activates the navigation panel:

```typescript
this.on("ArrowRightKeyDown", () => {
  this.workspace.activateView("navigation-panel");
});
```

---

## CSS

The panel uses:
- `.workspace-sidepanel.left` — positions it on the left side
- `.sidepanel-content` — standard sidepanel content wrapper

---

## Notes

- The `notesPanelZZZ` class (a previous notes panel implementation) still exists in the original source but is no longer used. It was superseded by `NotesPanel`.
- The navigation panel is intentionally minimal — it redirects to the command palette for all actual functionality rather than duplicating UI.
