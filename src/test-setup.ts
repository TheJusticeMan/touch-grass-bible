// Polyfill String.prototype.toTitleCase used by VerseRef.toString()
export {};

declare global {
  interface String {
    toTitleCase(): string;
  }
}

String.prototype.toTitleCase = function (this: string): string {
  return this.toLowerCase().replace(/\b\w/g, char => char.toUpperCase());
};
