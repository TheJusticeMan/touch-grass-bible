# CSS Improvement Guide For Touch Grass Bible

This guide replaces the old generic notes with a project-specific CSS review based on these files:

- `src/main.css`
- `src/VerseScreen.css`
- `src/external/App.css`
- `src/external/CommandPalette.css`
- `src/external/Components.css`
- `src/external/Workspace.css`
- `src/plugins/Notes/NotesPanel.css`
- `src/plugins/Journal/JournalPanel.css`

## What the current CSS gets right

- The app already uses some shared custom properties like `--foreground`, `--background`, and border-radius tokens.
- The workspace and command palette have a recognizable visual language built around translucent dark surfaces.
- CSS is already split by feature area, which makes it possible to improve incrementally instead of rewriting everything.
- The asymmetric border radius values like `0.5em 1em` and especially `1em 2em` give the UI a distinct softened, shifted-curve personality that should be preserved.

## Main problems to fix first

### 1. Consolidate design tokens

Right now the project mixes shared variables with many hardcoded values like `#fff1`, `#fff2`, `#fff4`, `#0008`, `#000c`, and one-off font stacks.

Add a stronger token layer in a shared file or at the root, but keep the signature shifted-curve radii as first-class tokens instead of normalizing everything to symmetric rounded corners:

```css
:root {
  --color-bg: #050505;
  --color-surface: rgb(255 255 255 / 0.06);
  --color-surface-strong: rgb(255 255 255 / 0.12);
  --color-border: rgb(255 255 255 / 0.14);
  --color-text: rgb(255 255 255 / 0.94);
  --color-text-muted: rgb(255 255 255 / 0.62);
  --color-accent: #9ed0ff;
  --shadow-soft: 0 8px 24px rgb(0 0 0 / 0.28);
  --radius-shift-sm: 0.35rem 0.7rem;
  --radius-shift-md: 0.5em 1em;
  --radius-shift-lg: 1em 2em;
  --radius-round-sm: 0.5rem;
  --radius-round-md: 0.875rem;
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
}
```

Then replace repeated inline color math across `src/external/Workspace.css`, `src/external/CommandPalette.css`, `src/plugins/Notes/NotesPanel.css`, and `src/plugins/Journal/JournalPanel.css`.

Important: do not flatten the current look into generic pill radii everywhere. The `1em 2em` curve should remain the default for major surfaces like panels, cards, overlays, and verse-adjacent containers unless there is a specific usability reason to use a tighter radius.

### 2. Fix global interaction rules

`src/external/App.css` currently applies very aggressive body rules:

- `overflow: hidden`
- `user-select: none`
- `touch-action: none`

These make text selection, native scrolling, and normal form interaction harder than they should be.

Recommended direction:

- keep `overflow: hidden` only where layout containers truly need it
- remove global `user-select: none`; apply it only to drag handles and icon-only controls
- remove global `touch-action: none`; use it only on drag/swipe elements like resize handles or scroll bubbles

### 3. Improve accessibility and keyboard visibility

The CSS is still mouse-first in several places.

Common issues:

- hover styles without equivalent focus styles
- hidden scrollbars in `src/VerseScreen.css`
- clickable UI that may not expose obvious focus affordances
- animations without reduced-motion handling

Add a shared focus rule set:

```css
:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
```

And add reduced-motion handling:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

### 4. Reduce CSS drift between feature areas

Different files define their own fonts and interaction patterns:

- `src/external/App.css` uses `Arial, sans-serif`
- `src/external/CommandPalette.css` uses `sans-serif`
- `src/plugins/Notes/NotesPanel.css` uses a system font stack
- `src/VerseScreen.css` relies on `var(--font)`

Pick one project-level typography system and expose it as variables. The current mix makes the UI feel assembled instead of designed.

### 5. Standardize layering and overlays

The project uses multiple ad hoc z-index values:

- `10`
- `999`
- `1000`
- `1200`
- `1300`

Create a small layering scale:

```css
:root {
  --z-floating-action: 20;
  --z-panel-overlay: 200;
  --z-menu: 400;
  --z-command-palette: 800;
  --z-modal: 900;
}
```

This will make `Workspace`, `CommandPalette`, context menus, and note overlays much easier to reason about.

### 6. Preserve the app's signature curve language

One thing that should not be lost during cleanup is the app's distinctive border radius style.

Keep this principle:

- shifted asymmetric radii like `1em 2em` are part of the app identity
- large interactive surfaces should usually use shifted radii, not generic `12px` or `999px` rounding
- only use fully round radii for clearly circular controls like icon buttons or floating action buttons
- if a new component is meant to feel native to this app, start with the shifted radius tokens first

That means cleanup should aim for consistency, not flattening.

## File-by-file recommendations

### `src/external/App.css`

- Replace hardcoded `100vw` and `100vh` shell sizing with `100%` or `100dvh` where appropriate.
- Stop applying `cursor: pointer` to all `input`, `textarea`, and `select` elements.
- Move shared control styling into a reusable control class instead of globally styling every form element the same way.
- Add a real focus state instead of relying on `outline: none`.

### `src/main.css`

- Move root variables from `body` to `:root` unless they are intentionally page-scoped.
- Replace custom properties like `--readingwidth` and `--navbarheight` with kebab-case names for consistency, such as `--reading-width` and `--navbar-height`.
- Preserve `--border-radius-small`, `--border-radius-medium`, and `--border-radius-large` as signature shifted-curve tokens, even if you rename them for consistency.
- Revisit `min-height: 100vh` on the last verse block; it may create awkward whitespace on mobile and in embedded panels.
- The `.wrap .chapter` selectors are doing structural styling that would be clearer with component-level class names.

### `src/VerseScreen.css`

- Do not hide all scrollbars by default; at minimum, only hide them when a better visual cue exists.
- Add explicit styles for expanded verse info blocks beyond `display: block`.
- Replace hardcoded bookmark colors like `#f0f` with named accent variables.
- Avoid relying on `.active .info-container` alone if the DOM structure changes frequently; use a more direct component class when possible.

### `src/external/CommandPalette.css`

- Replace generic `font-family: sans-serif` with project typography tokens.
- Add `:focus-visible` styles for `.command-item`, header buttons, and category titles.
- Improve large-screen layout by adding a max width and centering the palette.
- Reduce duplicated `display: flex` declarations and remove commented-out dead code.
- `user-select: none` on the whole palette should be narrowed; users may need to copy text from descriptions.

### `src/external/Components.css`

- Give `.context-menu` an explicit z-index token.
- Increase `.scroll-bubble` touch target size and provide a visible active/focus state.
- Replace comment-heavy sections with small utility tokens or more descriptive section grouping.
- Add disabled styles if menu items or icon actions can become unavailable.

### `src/external/Workspace.css`

- This file should become the main source of shared layout tokens for panel chrome.
- Keep tab, panel, and workspace surface radii aligned with the project's asymmetric curve language instead of replacing them with generic symmetric radii.
- Replace `first-of-type` and `last-of-type` mobile side-panel assumptions with explicit panel-role classes.
- Add keyboard focus styles for tabs, close buttons, add buttons, resize handles, and window controls.
- Add `prefers-reduced-motion` coverage for transforms and transitions.
- Extract repeated translucent surface values into tokens instead of embedding them in many selectors.

### `src/plugins/Notes/NotesPanel.css`

- This file is the most visually custom, but it needs cleanup.
- Replace `transition: all` with targeted properties.
- Avoid `overflow: scroll`; use `overflow: auto` unless scrollbars should always show.
- `min-height: 100vh` can fight the workspace layout; prefer `min-height: 100%` inside the panel system.
- The editor overlay should use `100dvh` instead of `100vh`.
- `backdrop-filter: Blur(8px)` should be normalized to `blur(8px)` for consistency.
- `.tag-remove-btn { font-size: 0.012px; }` is a red flag and should be replaced with intentional visually-hidden or icon-button styling.
- The fade-in animation should be disabled for reduced-motion users.

### `src/plugins/Journal/JournalPanel.css`

- Promote repeated surface, border, and muted text colors into shared tokens.
- Add focus styles for `summary`, textarea, and any clickable journal entries.
- If verse history entries become clickable, add hover and focus states that clearly communicate it.
- Sticky day headers are good; keep them, but use shared spacing and border tokens.

## Suggested CSS architecture for this project

Use a simple layered approach rather than a full framework rewrite.

### Layer 1: foundation

- reset/base rules
- tokens for color, spacing, radius, typography, motion, shadows, z-index
- global accessibility helpers

### Layer 2: primitives

- buttons
- inputs
- surface cards
- overlays
- scroll affordances
- focus ring helpers

### Layer 3: framework

- workspace shell
- command palette
- context menu
- panel tabs

### Layer 4: feature styles

- verse screen
- notes panel
- journal panel

That means `src/external/App.css`, `src/external/Components.css`, `src/external/Workspace.css`, and `src/external/CommandPalette.css` should define most reusable patterns. Feature CSS files should mostly compose those patterns instead of starting from scratch.

## Practical cleanup rules

- Prefer kebab-case custom property names consistently.
- Prefer semantic class names over location-based selectors like `.content .chapter .verse` when possible.
- Preserve the asymmetric `1em 2em` curve language as a deliberate design choice, not an inconsistency to be normalized away.
- Avoid `transition: all`.
- Avoid global `outline: none` unless a replacement focus style exists.
- Avoid commented-out CSS blocks staying in production files for long periods.
- Prefer `overflow: auto` over `overflow: scroll` unless forced scrollbars are intentional.
- Prefer `min-height: 100%` inside panel containers over `100vh` unless the element truly owns the viewport.
- Use component tokens for colors instead of repeated `#fff2` and `#0008` literals.

## Suggested implementation order

1. Fix `src/external/App.css` global interaction rules.
2. Create shared color, spacing, radius, motion, and z-index tokens.
3. Add global `:focus-visible` and `prefers-reduced-motion` support.
4. Normalize typography across app shell, command palette, notes, and reading view.
5. Refactor `src/external/Workspace.css` and `src/external/CommandPalette.css` to consume shared tokens.
6. Clean up `src/plugins/Notes/NotesPanel.css`, which currently has the most one-off styling and a few obvious smell points.
7. Revisit `src/VerseScreen.css` scrollbar and interaction visibility decisions.

## Definition of done for CSS cleanup

- shared tokens exist and replace most repeated color literals
- shifted radius tokens are preserved and remain the default for major app surfaces
- keyboard focus is visible across all interactive surfaces
- reduced-motion users are respected
- overlays and menus use a documented z-index scale
- no global rule blocks normal text selection or form use unnecessarily
- feature styles depend on shared primitives instead of redefining their own visual systems
