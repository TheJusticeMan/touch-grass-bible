import van from "vanjs-core";
const mediaQuery =
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(max-width: 700px)")
    : null;

export const Platform = {
  /**
   * A reactive state indicating whether the platform is considered "wide screen" (i.e., not a mobile device).
   * This state is determined by a media query that checks if the viewport width is less than or equal to 700 pixels.
   * It updates automatically when the viewport size changes.
   *
   * @type {van.State<boolean>}
   * @example
   * ```typescript
   * // Reactively respond to changes in screen width
   * van.derive(() => {
   *   if (Platform.isWideScreen.val) {
   *     console.log("The platform is wide screen.");
   *   } else {
   *     console.log("The platform is narrow screen (mobile).");
   *   }
   * });
   * ```
   */
  isWideScreen: van.state(mediaQuery ? !mediaQuery.matches : true),
};

mediaQuery?.addEventListener("change", e => (Platform.isWideScreen.val = !e.matches));
