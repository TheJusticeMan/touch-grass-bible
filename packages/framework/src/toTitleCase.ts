export {};

declare global {
  interface String {
    /**
     * Converts a string to Title Case.
     *
     * @returns The string converted to Title Case.
     *
     * @example
     * ```ts
     * "hello world".toTitleCase(); // "Hello World"
     * ```
     */
    toTitleCase(this: String): string;
  }
}

String.prototype.toTitleCase = function (this: string): string {
  return this.toLowerCase().replace(/\b\w/g, char => char.toUpperCase());
};
