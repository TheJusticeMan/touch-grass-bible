# AGENTS.md

This file contains instructions for agentic coding assistants working on the Touch Grass Bible codebase. It includes build/lint/test commands and code style guidelines inferred from the project structure, TypeScript config, ESLint config, and existing code.

## Build, Lint, and Test Commands

### Build Commands

- **Development server**: `npm run dev` - Starts the web development build and local server.
- **Production build**: `npm run build` - Alias for `npm run build:web`.
- **Web build**: `npm run build:web` - Builds for web deployment.
- **Electron build**: `npm run build:electron` - Builds Electron distributable files into `dist`.
- **Electron run**: `npm run run:electron` - Builds and launches Electron from `dist`.
- **Electron package**: `npm run package:electron` - Builds and packages Electron app.
- **Electron make**: `npm run make:electron` - Builds installer artifacts with Electron Forge.
- **Capacitor build**: `npm run build:capacitor` - Builds for mobile (Capacitor).
- **Capacitor sync**: `npm run sync:capacitor` - Syncs Capacitor platforms.
- **Android run**: `npm run run:android` - Builds Capacitor app and runs on Android.
- **iOS run**: `npm run run:ios` - Builds Capacitor app and runs on iOS.
- **Clean build**: `npm run clean` - Removes dist directory.
- **Get data files**: `npm run getdatafiles` - Fetches and processes Bible data files.

### Lint Commands

- **Lint**: `npm run lint` - Runs ESLint on all TypeScript files under `src/`.
- **Format**: `npm run format` - Formats TypeScript and Markdown files with Prettier.

### Test Commands

- **Test**: `npm test` - Currently echoes "Error: no test specified" (no test suite configured).
- **Running a single test**: No tests exist. To add testing:
  1. Install Jest: `npm install --save-dev jest @types/jest vitest` (vitest for modern testing).
  2. Add test script to package.json: `"test": "jest"` or `"test": "vitest"`.
  3. Create test files like `src/component.test.ts`.
  4. Run single test: `npx jest src/component.test.ts` or `npx vitest run src/component.test.ts`.

## Code Style Guidelines

### Language and Environment

- **TypeScript**: Mandatory. Use strict mode as per tsconfig.json (target ES2020, strict: true, no unused locals/parameters).
- **Module system**: ES modules (type: "module" in package.json).
- **Browser/Node**: Code runs in browser with Node.js build tools. Use globals.browser and globals.node in ESLint.
- **No semicolons**: Inferred from code (JavaScript ASI).

### File Structure

- **Directories**: src/ for source, dist/ for build output.
- **File naming**: Use camelCase or PascalCase matching exported class/interface (e.g., CommandPalette.ts).
- **Imports**: Group external libraries first, then local relative imports. Use absolute paths if possible.

### Naming Conventions

- **Classes**: PascalCase (e.g., TouchGrassBibleApp, UnifiedCommandPalette).
- **Interfaces/Types**: PascalCase (e.g., TGAppSettings, CommandPaletteState).
- **Methods/Functions**: camelCase (e.g., onload, saveSettings).
- **Properties/Variables**: camelCase (e.g., settings, commandPalette). Use UPPER_CASE for constants if global (rare).
- **Private members**: Prefix with underscore (e.g., \_state, but not consistently used).
- **Events**: Lowercase with dashes if needed (e.g., "update", "keydown").

### Types and TypeScript

- **Strict typing**: Always use types. Avoid `any`; use `unknown` or specific unions.
- **Generics**: Use for reusable components (e.g., CommandCategory<T>, CommandItem<T>).
- **Definite assignment**: Use `!` for properties assigned in constructor or init methods (e.g., settings!: TGAppSettings).
- **Optional properties**: Use `?` for optional params/properties.
- **Return types**: Specify return types for functions/methods, especially public ones.
- **Enums**: Use if needed, but prefer unions (e.g., inputMode: "search" | "text").

### Error Handling

- **Try-catch**: Wrap async operations and potential errors in try-catch blocks.
- **Logging**: Use app.console.error for errors (e.g., this.app.console.error(`Error in ${this.constructor.name}.onTrigger`, e)).
- **Promises**: Use async/await; handle rejections with try-catch.
- **Validation**: Check for null/undefined where necessary, but rely on TypeScript strictness.

### Formatting and Style

- **Indentation**: 2 spaces (inferred from code).
- **Line length**: No explicit limit; keep lines readable (aim for <100 chars).
- **Braces**: Same line for classes/functions (e.g., class Foo {).
- **Spacing**: Space after keywords (if, for), around operators.
- **Quotes**: Double quotes for strings (inferred).
- **Arrays/Objects**: Trailing commas in multiline.
- **Comments**: JSDoc for classes/methods/properties. Inline comments for complex logic. No unnecessary comments.
- **Prettier**: Use for auto-formatting; config inferred (defaults: 2 spaces, double quotes, trailing commas).

### Code Patterns

- **Classes**: Extend base classes (e.g., App, ETarget). Use constructor for setup.
- **Methods**: Public methods first, then protected/private. Use arrow functions for callbacks if binding needed.
- **Events**: Emit events using this.emit(). Listen with this.on().
- **DOM manipulation**: Use createEl for elements. Chain methods (e.g., new Button().setIcon().on()).
- **Async**: Use async for methods that may await. Avoid blocking operations.
- **State management**: Centralize in classes (e.g., CommandPaletteState). Update via methods.
- **Security**: Never log secrets. Use https for URLs. Avoid eval/dangerous code.

### ESLint Rules

- Follow recommended JS/TS rules.
- Special: Allow require in electron files (@typescript-eslint/no-require-imports: off for src/electron/).
- Fix lint errors before committing.

### Git and Workflow

- **Commits**: Use descriptive messages (e.g., "feat: add dark mode toggle").
- **Branches**: Feature branches for changes.
- **Lint/Typecheck**: Run `npm run lint` and `npm run build` (for typecheck) before push.
- **No secrets**: Never commit keys or sensitive data.

### Additional Notes

- **Framework**: Custom framework (extends App, uses Event system).
- **External framework boundary**: `packages/framework/src/**` must remain self-contained and must not import app-host aliases/modules outside `packages/framework/src` (for example `@platform`, `@touch-grass-bible`, `src/*`, or upward-relative escapes like `../../*`). Platform wiring belongs in app/bootstrap layers.
- **Libraries**: lucide for icons, js-levenshtein for fuzzy search.
- **No Cursor/Copilot rules**: None found in .cursor/rules/, .cursorrules, or .github/copilot-instructions.md.
- **Testing**: Add unit tests for components (e.g., VerseScreen, CommandPalette). Use Jest/Vitest.
- **Documentation**: Update this file as conventions evolve.

This document is ~150 lines. Agents should follow these guidelines to maintain consistency.
