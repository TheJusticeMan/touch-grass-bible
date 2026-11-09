# Rules

## TypeScript

- An arrow function must not have brackets if it's only one line of code.
- Every method should return this if it's not returning something else.
- Keep tiny callbacks and transforms as concise arrow functions, especially DOM handlers, mappers, and one-line reactive helpers.
- Use fluent mutators for builders, registrars, and lifecycle helpers so call chains stay readable.
- Prefer `van.state` and `van.derive` for syncing app, view, and derived state instead of maintaining mirrored variables by hand.
- When a command-palette callback decides whether the palette stays open, return an explicit boolean instead of relying on side effects.

## CSS

- Use variables for all colors, sizing, and spacing, etc.
- Define colors, spacing, sizing, radii, and shadows as custom properties first, then consume them through `var()`.
