# CSS Improvement Guide

This guide is specific to the current Touch Grass Bible stylesheets, not generic CSS advice.

Reviewed files:

- `src/main.css`
- `src/VerseScreen.css`
- `src/external/App.css`
- `src/external/CommandPalette.css`
- `src/external/UIComponents.css`
- `src/external/Workspace.css`
- `src/plugins/Notes/NotesPanel.css`
- `src/plugins/Journal/JournalPanel.css`

## What is already working well

- `src/main.css` already acts as the main token file and has a decent base for color, spacing, radius, z-index, and reduced-motion rules.
- Shared focus styling exists in several places, which means the project already has the right accessibility direction.
- The project is already split into logical CSS files by feature area instead of one giant stylesheet.
- Workspace, notes, journal, and palette styles already use CSS variables enough that a stronger design system is realistic.

## Main problems found in the current CSS

### 1. Tokens are only partially centralized

- `src/main.css` defines many tokens, but several files still use raw colors like `#222`, `#444`, `white`, `rgb(0 0 0 / 0.5)`, and repeated border values.
- `src/VerseScreen.css` still depends on older variables like `--background`, `--foreground`, `--font`, and `--font-size`, while newer files use `--color-*` and `--font-*` tokens.
- Some files mix old aliases like `--border-radius-large` with newer names like `--radius-round-sm`.

Fix:

- Keep `src/main.css` as the only design-token source.
- Phase out legacy aliases once the rest of the CSS is updated.
- Replace hardcoded colors and dimensions in feature files with semantic tokens.

## 2. Component ownership is blurry

- `.icon-button` appears in both `src/external/CommandPalette.css` and `src/VerseScreen.css` with different behavior.
- Reading styles are split between `src/main.css` and `src/VerseScreen.css`, which is workable, but the boundary is not obvious.
- Some shared interaction patterns are repeated instead of abstracted, especially focus, hover, borders, glass backgrounds, and panel surfaces.

Fix:

- Define one owner per reusable class.
- Keep app-wide primitives in `src/external/UIComponents.css` or `src/main.css`.
- Keep feature-specific classes local to their screen or plugin stylesheet.
- Avoid reusing generic class names like `.icon-button` unless they are truly shared.

## 3. Accessibility is improved but still inconsistent

- Many controls have `:focus-visible`, but not all interactive surfaces are equally clear.
- `src/VerseScreen.css` intentionally hides scrollbars, which may be acceptable for the reading view, but it should be paired with stronger alternative cues and touch-target checks.
- `src/external/Workspace.css` and `src/external/CommandPalette.css` are much better than before, but there are still hover-heavy patterns and subtle low-contrast text in some areas.
- `src/external/App.css` still locks the shell to `overflow: hidden`, which makes layout behavior more fragile and raises the bar for every child surface to handle scrolling perfectly.

Fix:

- Standardize focus states through shared tokens instead of per-file ad hoc outlines.
- Audit contrast for muted text against translucent surfaces.
- Keep hidden-scrollbar behavior only where it is product-critical.
- Prefer minimum 44px touch targets for floating actions, tab controls, menu items, and verse actions.

## 4. Mobile behavior is still somewhat structural, not semantic

- `src/external/Workspace.css` still uses positional selectors like `:first-of-type` and `:last-of-type` for mobile side panels.
- That makes the mobile layout depend on DOM order rather than explicit intent.
- Overlay, side-panel, and floating-action behavior is spread across multiple files instead of using a shared shell pattern.

Fix:

- Move mobile panel behavior to role classes such as `.panel-is-left`, `.panel-is-main`, and `.panel-is-right`.
- Standardize overlay layout primitives for fullscreen editors, modals, and sheets.
- Use safe-area aware spacing tokens for mobile fixed-position UI.

## 5. Motion and visual language are not fully unified

- Some files use hover lift, blur, and glow well.
- `src/plugins/Notes/NotesPanel.css` adds its own animation and overlay styling that feels separate from the rest of the app.
- Multiple files define translucent black surfaces independently.

Fix:

- Create a small motion system: hover, press, enter, overlay, and reduced-motion variants.
- Create surface tokens for panel, card, overlay, and elevated card instead of repeating `rgb(0 0 0 / ...)` and `rgb(255 255 255 / ...)` values.

## File-by-file guidance

### `src/main.css`

- Keep this as the token and global-rules file.
- Move any remaining one-off component styling out if it does not apply app-wide.
- Add semantic tokens for overlay backgrounds, card borders, muted text levels, and motion timing.
- Replace the bookmark accent `#f0f` with a named semantic token that fits the rest of the palette better.
- Add typography tokens for reading text, UI text, headings, and mono/debug text if needed.

### `src/external/App.css`

- Keep only shell-level rules here.
- Avoid setting interaction behavior globally unless every screen truly needs it.
- Recheck `overflow: hidden`, `overscroll-behavior: contain`, and `user-select: none` at the shell level.
- Add shared control states for disabled, hover, focus, and pressed behavior instead of relying on individual feature files.

### `src/external/Workspace.css`

- Convert mobile side panels from positional selectors to semantic role classes.
- Pull repeated translucent surfaces into reusable tokens.
- Normalize tab, close-button, resize-handle, and window-control sizing around shared size tokens.
- Add clearer active, hover, and drag states that remain legible on lower-contrast displays.

### `src/external/CommandPalette.css`

- Replace undeclared or unclear values like `var(--accent1)` with real shared tokens.
- Normalize spacing and type scale with the token system from `src/main.css`.
- Tighten hierarchy between palette chrome, category headers, and command rows.
- Consider a clearer visual distinction between selected row, hovered row, and focused row.

### `src/external/UIComponents.css`

- Treat this as the primitive layer for menus, surfaces, layout helpers, and scroll bubbles.
- Add shared interactive states once here so feature files do not keep recreating them.
- Convert fixed menu spacing and sizing to tokens.
- Add a shared elevation system instead of file-local shadows.

### `src/VerseScreen.css`

- Migrate old variables to the same token system used elsewhere.
- Rename or scope `.icon-button` if it is not the same primitive used by the palette.
- Consider moving generic note-editor styles out if they overlap with the Notes plugin patterns.
- Keep reading-surface behavior minimal here: only styles specific to verse interaction should live in this file.

### `src/plugins/Notes/NotesPanel.css`

- This file needs the biggest cleanup.
- Replace repeated hardcoded colors, shadows, and animation values with tokens.
- Unify overlay styles with other fullscreen surfaces.
- Split the file conceptually into note list, floating action, editor overlay, and tag UI sections.
- Remove duplicate `.note-preview` blocks unless the second block is intentionally modifier-based.

### `src/plugins/Journal/JournalPanel.css`

- This file is relatively clean and should become a model for plugin CSS.
- Replace remaining raw translucent blacks with semantic surface tokens.
- Add a clearer interactive treatment for verse-reference entries if they become clickable.
- Reuse shared panel, card, and input tokens instead of redefining them locally.

## Recommended CSS architecture for this project

Use a simple layered model:

1. Tokens

- `src/main.css`
- colors, spacing, type, radius, shadows, z-index, motion, safe-area

2. Shell and primitives

- `src/external/App.css`
- `src/external/UIComponents.css`
- `src/external/Workspace.css`
- `src/external/CommandPalette.css`

3. App feature surfaces

- `src/VerseScreen.css`
- `src/plugins/Notes/NotesPanel.css`
- `src/plugins/Journal/JournalPanel.css`

Rule of thumb:

- If a class can be reused by more than one feature, it should not be owned by a plugin stylesheet.
- If a style only exists for one screen, keep it local.
- If a value appears three times, convert it to a token.

## Naming guidance for this codebase

- Prefer feature-scoped names over generic names.
- Good: `.journal-entry`, `.note-preview`, `.panel-tab`, `.palette-search`
- Risky: `.content`, `.active`, `.icon-button`, `.visible`
- If a class is intentionally generic, document which file owns it.

Recommended pattern:

- shared primitive: `.ui-*`
- workspace: `.panel-*`, `.workspace-*`
- palette: `.palette-*`, `.command-*`
- verse screen: `.verse-*`, `.reading-*`
- notes: `.note-*`, `.editor-*`, `.tag-*`
- journal: `.journal-*`

## Short implementation plan

### Phase 1: token cleanup

- Add missing semantic tokens in `src/main.css`
- Replace hardcoded colors, shadows, and radii in all other CSS files
- Remove legacy aliases only after all references are migrated

### Phase 2: shared primitives cleanup

- Resolve duplicate ownership of `.icon-button` and similar shared classes
- Centralize button, surface, overlay, menu, and focus patterns
- Standardize interactive states across workspace, palette, notes, and journal

### Phase 3: mobile and layout cleanup

- Replace positional mobile workspace selectors with semantic classes
- Add safe-area spacing for fullscreen overlays and floating actions
- Audit hidden overflow and hidden scrollbar usage

### Phase 4: feature polish

- Refactor `src/plugins/Notes/NotesPanel.css` into clearer sections and shared primitives
- Align `src/VerseScreen.css` with the main token system
- Make journal and notes overlays feel like part of one app, not separate mini-themes

## Tooling recommendations

- Add Stylelint with rules for duplicate properties, unknown custom properties, and color/token enforcement.
- Keep Prettier for formatting, but let Stylelint enforce architecture decisions.
- Add a small visual QA checklist for desktop, mobile, keyboard-only navigation, and reduced-motion mode.

## Success criteria

The CSS is in good shape when:

- all major colors, spacing values, shadows, radii, and motion timings come from tokens
- shared classes have one clear owner
- feature styles no longer redefine common surfaces and controls
- mobile layout rules depend on semantic classes, not DOM order
- focus, hover, pressed, and disabled states feel consistent across the app
- the notes, journal, workspace, and reading surfaces look like one design system
